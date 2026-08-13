import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { FlowRunStatus } from "@nlpearl/database";
import { PrismaService } from "../../prisma/prisma.service";
import { FlowConfigService } from "../flow-config/flow-config.service";
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

    try {
      const config = await this.flowConfigService.findByFlowType(flowRun.flowType);
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
          nlpearlCallRequestId: response.id,
          status: FlowRunStatus.CallTriggered,
          events: { create: { status: FlowRunStatus.CallTriggered, detail: response.id } },
        },
      });
    } catch (error) {
      await this.transitions.fail(flowRun.id, `NLPearl call trigger failed: ${(error as Error).message}`);
    }
  }
}
