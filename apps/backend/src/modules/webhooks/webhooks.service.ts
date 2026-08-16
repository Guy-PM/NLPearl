import { Injectable, Logger } from "@nestjs/common";
import { FlowRunStatus } from "@nlpearl/database";
import { PrismaService } from "../../prisma/prisma.service";
import { renderTemplate } from "../../common/render-template";
import { FlowConfigService } from "../flow-config/flow-config.service";
import { MessageDispatchService } from "../message-dispatch/message-dispatch.service";
import { needsRetry } from "../message-dispatch/retry-policy";
import { NlpearlService } from "../nlpearl/nlpearl.service";
import { NotificationService } from "../notification/notification.service";
import { FlowRunTransitionService } from "../flow-runs/flow-run-transition.service";
import { NlpearlCallEndedWebhookDto, NlpearlConsentWebhookDto } from "./dto/nlpearl-webhooks.dto";

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowConfigService: FlowConfigService,
    private readonly nlpearlService: NlpearlService,
    private readonly notificationService: NotificationService,
    private readonly transitions: FlowRunTransitionService,
    private readonly dispatchService: MessageDispatchService,
  ) {}

  async handleConsent(dto: NlpearlConsentWebhookDto): Promise<void> {
    const flowRun = await this.prisma.flowRun.findUnique({
      where: { mpl_flowType: { mpl: dto.mpl, flowType: dto.flowType } },
    });

    if (!flowRun || flowRun.status !== FlowRunStatus.CallTriggered) {
      this.logger.warn(
        `No CallTriggered FlowRun found for mpl=${dto.mpl} flowType=${dto.flowType} — consent webhook ignored`,
      );
      return;
    }

    const config = await this.flowConfigService.findByFlowType(dto.flowType);
    const text = renderTemplate(config.consentSmsTemplate, flowRun);
    await this.notificationService.sendSms(dto.phone, text);
    await this.transitions.transition(flowRun.id, FlowRunStatus.ConsentGiven);
  }

  async handleCallEnded(dto: NlpearlCallEndedWebhookDto): Promise<void> {
    if (dto.status === "InProgress") {
      // This is the call-started delivery of the same webhook; nothing to do yet.
      return;
    }

    const flowRun = dto.to
      ? await this.prisma.flowRun.findFirst({
          where: {
            phone: dto.to,
            status: { in: [FlowRunStatus.CallTriggered, FlowRunStatus.ConsentGiven] },
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

    if (!flowRun) {
      this.logger.warn(`Could not correlate call-ended webhook (callId=${dto.id}) to a FlowRun`);
      return;
    }

    const call = await this.nlpearlService.getCall(dto.id);

    // The call CallTriggerWorker created (nlpearlCallId still unset) is the
    // one this webhook completes. Falls back to creating one if it's
    // missing for some reason (e.g. manual/replayed webhook).
    const pendingCall = await this.prisma.nlpearlCall.findFirst({
      where: { flowRunId: flowRun.id, nlpearlCallId: null },
      orderBy: { createdAt: "desc" },
    });

    const callData = {
      nlpearlCallId: call.id,
      callStatus: String(call.status),
      conversationStatus: String(call.conversationStatus),
      duration: call.duration ?? undefined,
      summary: call.summary ?? undefined,
      recordingUrl: call.recording ?? undefined,
      collectedInfo: (call.collectedInfo as object) ?? undefined,
    };

    if (pendingCall) {
      await this.prisma.nlpearlCall.update({ where: { id: pendingCall.id }, data: callData });
    } else {
      await this.prisma.nlpearlCall.create({ data: { flowRunId: flowRun.id, ...callData } });
    }

    const config = await this.flowConfigService.findByFlowType(flowRun.flowType);
    const shouldRetry = needsRetry(config, flowRun.attemptCount, {
      callStatus: callData.callStatus,
      conversationStatus: callData.conversationStatus,
      duration: callData.duration ?? null,
    });

    if (shouldRetry) {
      const reason = `callStatus=${callData.callStatus} conversationStatus=${callData.conversationStatus} duration=${callData.duration ?? "n/a"}`;
      await this.dispatchService.scheduleRetry(flowRun, config, reason);
      return;
    }

    await this.transitions.transition(flowRun.id, FlowRunStatus.Completed, call.id);
  }
}
