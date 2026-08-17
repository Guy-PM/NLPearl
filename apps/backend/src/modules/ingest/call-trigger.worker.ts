import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { FlowRunStatus } from "@nlpearl/database";
import { PrismaService } from "../../prisma/prisma.service";
import { FlowConfigService } from "../flow-config/flow-config.service";
import { MessageDispatchService } from "../message-dispatch/message-dispatch.service";
import { needsRetryAfterTriggerFailure } from "../message-dispatch/retry-policy";
import { NlpearlService } from "../nlpearl/nlpearl.service";
import { SchedulerService } from "../scheduler/scheduler.service";
import { FlowRunTransitionService } from "../flow-runs/flow-run-transition.service";
import { TRIGGER_NLPEARL_CALL_JOB } from "./ingest.constants";

interface TriggerCallJobData {
  flowRunId: string;
}

/**
 * Handles the delayed "trigger-nlpearl-call" job enqueued by IngestService
 * once the X-minute wait (per FlowConfig.delayMinutes) elapses.
 */
@Injectable()
export class CallTriggerWorker implements OnModuleInit {
  private readonly logger = new Logger(CallTriggerWorker.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowConfigService: FlowConfigService,
    private readonly nlpearlService: NlpearlService,
    private readonly scheduler: SchedulerService,
    private readonly transitions: FlowRunTransitionService,
    private readonly dispatchService: MessageDispatchService,
  ) {}

  async onModuleInit() {
    await this.scheduler.registerWorker<TriggerCallJobData>(
      TRIGGER_NLPEARL_CALL_JOB,
      (data) => this.handle(data),
    );
  }

  private async handle({ flowRunId }: TriggerCallJobData): Promise<void> {
    const flowRun = await this.prisma.flowRun.findUnique({ where: { id: flowRunId } });
    if (!flowRun) {
      this.logger.warn(`FlowRun ${flowRunId} not found, skipping call trigger`);
      return;
    }

    // Every path that ends in an actual NLPearl call (initial dispatch,
    // cron-batched dispatch, auto-retry, manual resend) funnels through
    // this one job before placing it — sharing the same check MessageDispatchService
    // uses before the SMS send is enough to cover all of them.
    if (await this.dispatchService.skipIfCtaCompleted(flowRun)) {
      this.logger.log(`FlowRun ${flowRunId} already has CTA completed, skipping call trigger`);
      return;
    }

    const config = await this.flowConfigService.findByFlowType(flowRun.flowType);

    try {
      const response = await this.nlpearlService.makeCall(config.nlpearlOutboundId, {
        to: flowRun.phone,
        callData: {
          name: flowRun.name,
          mpl: flowRun.mpl,
          cfaUrl: flowRun.cfaUrl,
          flowType: flowRun.flowType,
        },
      });

      await this.prisma.flowRun.update({
        where: { id: flowRun.id },
        data: {
          status: FlowRunStatus.CallTriggered,
          calls: { create: { nlpearlCallRequestId: response.id } },
          events: { create: { status: FlowRunStatus.CallTriggered, detail: response.id } },
        },
      });
    } catch (error) {
      const errorMessage = `NLPearl call trigger failed: ${(error as Error).message}`;
      if (needsRetryAfterTriggerFailure(config, flowRun.attemptCount)) {
        this.logger.warn(`${errorMessage} — scheduling auto-retry for FlowRun ${flowRun.id}`);
        await this.dispatchService.scheduleRetry(flowRun, config, errorMessage);
      } else {
        await this.transitions.fail(flowRun.id, errorMessage);
      }
    }
  }
}
