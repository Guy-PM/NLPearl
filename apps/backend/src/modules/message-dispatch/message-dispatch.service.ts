import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { FlowConfig, FlowRun, FlowRunStatus } from "@nlpearl/database";
import { PrismaService } from "../../prisma/prisma.service";
import { renderTemplate } from "../../common/render-template";
import { NotificationService } from "../notification/notification.service";
import { SchedulerService } from "../scheduler/scheduler.service";
import { TRIGGER_NLPEARL_CALL_JOB } from "../ingest/ingest.constants";

function dispatchJobName(flowType: string): string {
  return `dispatch-pending:${flowType}`;
}

const RETRY_FLOW_RUN_JOB = "retry-flow-run";

interface RetryJobData {
  flowRunId: string;
}

/**
 * Owns sending the preliminary SMS and scheduling the delayed NLPearl
 * call trigger — either immediately for a single record (IngestService,
 * when FlowConfig.sendSchedule is unset) or in a batch, on a per-flow
 * cron schedule, for every record currently sitting at `Received`.
 */
@Injectable()
export class MessageDispatchService implements OnModuleInit {
  private readonly logger = new Logger(MessageDispatchService.name);
  private readonly registeredWorkers = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationService: NotificationService,
    private readonly scheduler: SchedulerService,
  ) {}

  // Deliberately duplicated (not imported) from FlowRunTransitionService —
  // importing FlowRunsModule here would create a module cycle, since
  // FlowRunsModule needs this service for the manual "Resend" action.
  private transition(flowRunId: string, status: FlowRunStatus, detail?: string) {
    return this.prisma.flowRun.update({
      where: { id: flowRunId },
      data: { status, events: { create: { status, detail } } },
    });
  }

  /**
   * If this record's CTA is already confirmed complete, nothing further
   * (SMS or call) should go out — marks it Completed and returns it.
   * Returns null if the caller should proceed normally. Deliberately NOT
   * applied to the manual "Resend" action — that's an explicit human
   * override. Public so IngestService and CallTriggerWorker can share it.
   */
  async skipIfCtaCompleted(flowRun: FlowRun): Promise<FlowRun | null> {
    if (!flowRun.ctaCompleted) return null;
    return this.transition(flowRun.id, FlowRunStatus.Completed, "CTA already completed — skipped");
  }

  private fail(flowRunId: string, errorMessage: string) {
    return this.prisma.flowRun.update({
      where: { id: flowRunId },
      data: {
        status: FlowRunStatus.Failed,
        errorMessage,
        events: { create: { status: FlowRunStatus.Failed, detail: errorMessage } },
      },
    });
  }

  /** Registers the retry worker and re-registers cron schedules on boot. */
  async onModuleInit(): Promise<void> {
    await this.scheduler.registerWorker<RetryJobData>(RETRY_FLOW_RUN_JOB, (data) =>
      this.handleRetry(data.flowRunId),
    );

    const scheduled = await this.prisma.flowConfig.findMany({
      where: { enabled: true, NOT: { sendSchedule: null } },
    });
    for (const config of scheduled) {
      await this.syncSchedule(config);
    }
  }

  private async handleRetry(flowRunId: string): Promise<void> {
    const flowRun = await this.prisma.flowRun.findUnique({ where: { id: flowRunId } });
    if (!flowRun) return;
    if (await this.skipIfCtaCompleted(flowRun)) return;
    const config = await this.prisma.flowConfig.findUnique({ where: { flowType: flowRun.flowType } });
    if (!config || !config.enabled) return;
    await this.dispatchOne(flowRun, config);
  }

  /**
   * Schedules an automatic retry (re-runs the full SMS+call sequence) after
   * `retryDelayMinutes` (or `delayMinutes` if unset). Called by
   * WebhooksService once a call ends and the flow's retry rules say it
   * qualifies — see retry-policy.ts.
   */
  async scheduleRetry(flowRun: FlowRun, config: FlowConfig, reason: string): Promise<void> {
    await this.prisma.flowRun.update({
      where: { id: flowRun.id },
      data: {
        attemptCount: { increment: 1 },
        status: FlowRunStatus.Scheduled,
        events: { create: { status: FlowRunStatus.Scheduled, detail: `Auto-retry scheduled: ${reason}` } },
      },
    });
    const delaySeconds = (config.retryDelayMinutes ?? config.delayMinutes) * 60;
    await this.scheduler.enqueueDelayed(RETRY_FLOW_RUN_JOB, { flowRunId: flowRun.id }, delaySeconds);
  }

  /**
   * Manually re-runs the full sequence right now, for the "Resend" action
   * in the dashboard — bypasses the retry attempt cap since a human
   * explicitly asked for it.
   */
  async resendNow(flowRun: FlowRun, config: FlowConfig): Promise<FlowRun> {
    const updated = await this.prisma.flowRun.update({
      where: { id: flowRun.id },
      data: {
        attemptCount: { increment: 1 },
        status: FlowRunStatus.Received,
        errorMessage: null,
        events: { create: { status: FlowRunStatus.Received, detail: "Manual resend" } },
      },
    });
    return this.dispatchOne(updated, config);
  }

  /** Called by FlowConfigService after a flow's config is created/updated. */
  async syncSchedule(config: FlowConfig): Promise<void> {
    const jobName = dispatchJobName(config.flowType);
    if (!config.enabled || !config.sendSchedule) {
      await this.scheduler.unschedule(jobName).catch(() => undefined);
      return;
    }
    await this.ensureWorker(config.flowType);
    await this.scheduler.scheduleCron(jobName, config.sendSchedule, { flowType: config.flowType }, config.sendTimezone);
  }

  /** Called by FlowConfigService after a flow's config is deleted. */
  async removeSchedule(flowType: string): Promise<void> {
    await this.scheduler.unschedule(dispatchJobName(flowType)).catch(() => undefined);
  }

  private async ensureWorker(flowType: string): Promise<void> {
    const jobName = dispatchJobName(flowType);
    if (this.registeredWorkers.has(jobName)) return;
    this.registeredWorkers.add(jobName);
    await this.scheduler.registerWorker<{ flowType: string }>(jobName, (data) =>
      this.dispatchPending(data.flowType),
    );
  }

  private async dispatchPending(flowType: string): Promise<void> {
    const config = await this.prisma.flowConfig.findUnique({ where: { flowType } });
    if (!config || !config.enabled) return;

    const pending = await this.prisma.flowRun.findMany({
      where: { flowType, status: FlowRunStatus.Received },
    });
    this.logger.log(`Dispatching ${pending.length} pending record(s) for flow "${flowType}"`);
    for (const flowRun of pending) {
      if (await this.skipIfCtaCompleted(flowRun)) continue;
      await this.dispatchOne(flowRun, config);
    }
  }

  /**
   * Sends the preliminary SMS and schedules the delayed NLPearl call
   * trigger for a single FlowRun. Never throws — failures are recorded on
   * the FlowRun itself, since this runs both inline (one record, where the
   * caller may still want to surface the failure) and in a batch loop
   * (many records, where one failure must not stop the rest).
   */
  async dispatchOne(flowRun: FlowRun, config: FlowConfig): Promise<FlowRun> {
    // Merge the raw N8N payload back in so templates can reference fields
    // that aren't promoted to their own FlowRun columns (e.g. first_name).
    const templateData = { ...(flowRun.rawPayload as object), ...flowRun };

    try {
      const text = renderTemplate(config.preliminarySmsTemplate, templateData);
      await this.notificationService.sendSms(flowRun.phone, text);
      await this.transition(flowRun.id, FlowRunStatus.PreSmsSent);
    } catch (error) {
      return this.fail(flowRun.id, `Preliminary SMS failed: ${(error as Error).message}`);
    }

    await this.scheduler.enqueueDelayed(
      TRIGGER_NLPEARL_CALL_JOB,
      { flowRunId: flowRun.id },
      config.delayMinutes * 60,
    );
    return this.transition(flowRun.id, FlowRunStatus.Scheduled);
  }
}
