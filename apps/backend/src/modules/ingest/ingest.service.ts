import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { FlowRun, FlowRunStatus } from "@nlpearl/database";
import { FlowTriggerPayload } from "@nlpearl/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { renderTemplate } from "../../common/render-template";
import { FlowConfigService } from "../flow-config/flow-config.service";
import { NotificationService } from "../notification/notification.service";
import { SchedulerService } from "../scheduler/scheduler.service";
import { RECORD_ENRICHMENT_PORT, RecordEnrichmentPort } from "../enrichment/enrichment.port";
import { FlowRunTransitionService } from "../flow-runs/flow-run-transition.service";
import { FlowTriggerDto } from "./dto/flow-trigger.dto";
import { TRIGGER_NLPEARL_CALL_JOB } from "./ingest.constants";

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowConfigService: FlowConfigService,
    private readonly notificationService: NotificationService,
    private readonly scheduler: SchedulerService,
    private readonly transitions: FlowRunTransitionService,
    @Inject(RECORD_ENRICHMENT_PORT) private readonly enrichment: RecordEnrichmentPort,
  ) {}

  /** `flowType:mpl:YYYY-MM-DD` — used only when N8N doesn't send its own requestId. */
  private synthesizeRequestId(dto: FlowTriggerDto): string {
    const day = new Date().toISOString().slice(0, 10);
    return `${dto.flowType}:${dto.mpl}:${day}`;
  }

  async handleFlowTrigger(dto: FlowTriggerDto, rawPayload: unknown): Promise<FlowRun> {
    const requestId = dto.requestId ?? this.synthesizeRequestId(dto);

    const existing = await this.prisma.flowRun.findUnique({ where: { requestId } });
    if (existing) {
      this.logger.log(`Duplicate flow-trigger for requestId=${requestId}, ignoring`);
      return existing;
    }

    const config = await this.flowConfigService.findByFlowType(dto.flowType);
    if (!config.enabled) {
      throw new BadRequestException(`FlowConfig "${dto.flowType}" is disabled`);
    }

    const enriched = await this.enrichment.enrich(dto as FlowTriggerPayload);

    const flowRun = await this.prisma.flowRun.create({
      data: {
        requestId,
        flowType: enriched.flowType,
        mpl: enriched.mpl,
        phone: enriched.phone,
        name: enriched.name,
        cfaUrl: enriched.cfaUrl,
        rawPayload: rawPayload as object,
        status: FlowRunStatus.Received,
        events: { create: { status: FlowRunStatus.Received } },
      },
    });

    try {
      const text = renderTemplate(config.preliminarySmsTemplate, enriched);
      await this.notificationService.sendSms(enriched.phone, text);
      await this.transitions.transition(flowRun.id, FlowRunStatus.PreSmsSent);
    } catch (error) {
      await this.transitions.fail(flowRun.id, `Preliminary SMS failed: ${(error as Error).message}`);
      throw error;
    }

    await this.scheduler.enqueueDelayed(
      TRIGGER_NLPEARL_CALL_JOB,
      { flowRunId: flowRun.id },
      config.delayMinutes * 60,
    );
    return this.transitions.transition(flowRun.id, FlowRunStatus.Scheduled);
  }
}
