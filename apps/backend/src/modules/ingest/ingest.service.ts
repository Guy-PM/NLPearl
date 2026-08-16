import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { FlowRun, FlowRunStatus } from "@nlpearl/database";
import { FlowTriggerPayload } from "@nlpearl/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { FlowConfigService } from "../flow-config/flow-config.service";
import { MessageDispatchService } from "../message-dispatch/message-dispatch.service";
import { RECORD_ENRICHMENT_PORT, RecordEnrichmentPort } from "../enrichment/enrichment.port";
import { FlowTriggerDto } from "./dto/flow-trigger.dto";

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly flowConfigService: FlowConfigService,
    private readonly dispatchService: MessageDispatchService,
    @Inject(RECORD_ENRICHMENT_PORT) private readonly enrichment: RecordEnrichmentPort,
  ) {}

  /** `flowType:mpl:YYYY-MM-DD` — used only when N8N doesn't send its own requestId. */
  private synthesizeRequestId(dto: FlowTriggerDto): string {
    const day = new Date().toISOString().slice(0, 10);
    return `${dto.flowType}:${dto.mpl}:${day}`;
  }

  /** Prefers an explicit `name`; otherwise joins `first_name`/`last_name`. */
  private resolveFullName(dto: FlowTriggerDto): string {
    if (dto.name) return dto.name;
    return [dto.first_name, dto.last_name].filter(Boolean).join(" ").trim();
  }

  async handleFlowTrigger(dto: FlowTriggerDto, rawPayload: unknown): Promise<FlowRun> {
    const requestId = dto.requestId ?? this.synthesizeRequestId(dto);

    const existing = await this.prisma.flowRun.findUnique({
      where: { mpl_flowType: { mpl: dto.mpl, flowType: dto.flowType } },
    });
    if (existing && existing.requestId === requestId) {
      this.logger.log(`Duplicate flow-trigger for requestId=${requestId}, ignoring`);
      return existing;
    }

    const config = await this.flowConfigService.findByFlowType(dto.flowType);
    if (!config.enabled) {
      throw new BadRequestException(`FlowConfig "${dto.flowType}" is disabled`);
    }

    const fullName = this.resolveFullName(dto);
    if (!fullName) {
      throw new BadRequestException("Either `name` or `first_name`/`last_name` must be provided");
    }

    const enriched = await this.enrichment.enrich(dto as FlowTriggerPayload);

    // One FlowRun per (mpl, flowType) — a new requestId for an existing
    // client+flow is a new attempt on the same record, not a new row.
    const flowRun = existing
      ? await this.prisma.flowRun.update({
          where: { id: existing.id },
          data: {
            requestId,
            name: fullName,
            phone: enriched.phone,
            cfaUrl: enriched.cfaUrl,
            rawPayload: rawPayload as object,
            status: FlowRunStatus.Received,
            errorMessage: null,
            events: { create: { status: FlowRunStatus.Received, detail: `New attempt: ${requestId}` } },
          },
        })
      : await this.prisma.flowRun.create({
          data: {
            requestId,
            flowType: enriched.flowType,
            mpl: enriched.mpl,
            phone: enriched.phone,
            name: fullName,
            cfaUrl: enriched.cfaUrl,
            rawPayload: rawPayload as object,
            status: FlowRunStatus.Received,
            events: { create: { status: FlowRunStatus.Received } },
          },
        });

    if (config.sendSchedule) {
      // Batched: leave it at Received — the flow's cron dispatch job will
      // send it at the next scheduled time.
      return flowRun;
    }

    const dispatched = await this.dispatchService.dispatchOne(flowRun, config);
    if (dispatched.status === FlowRunStatus.Failed) {
      throw new Error(dispatched.errorMessage ?? "Preliminary SMS failed");
    }
    return dispatched;
  }
}
