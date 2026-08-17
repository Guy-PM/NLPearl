import { BadRequestException, Inject, Injectable, Logger } from "@nestjs/common";
import { FlowRun, FlowRunStatus } from "@nlpearl/database";
import { FlowTriggerPayload } from "@nlpearl/shared-types";
import { PrismaService } from "../../prisma/prisma.service";
import { FlowConfigService } from "../flow-config/flow-config.service";
import { MessageDispatchService } from "../message-dispatch/message-dispatch.service";
import { RECORD_ENRICHMENT_PORT, RecordEnrichmentPort } from "../enrichment/enrichment.port";
import { CtaCompleteWebhookDto } from "./dto/cta-complete-webhook.dto";
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

  async handleFlowTrigger(
    dto: FlowTriggerDto,
    rawPayload: unknown,
  ): Promise<{ flowRun: FlowRun; outcome: "created" | "duplicate" | "updated" }> {
    const requestId = dto.requestId ?? this.synthesizeRequestId(dto);

    const existing = await this.prisma.flowRun.findUnique({
      where: { phone_flowType_mpl: { phone: dto.phone, flowType: dto.flowType, mpl: dto.mpl } },
    });
    if (existing && existing.requestId === requestId) {
      this.logger.log(`Duplicate flow-trigger for requestId=${requestId}, ignoring`);
      return { flowRun: existing, outcome: "duplicate" };
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
    const outcome = existing ? "updated" : "created";

    // One FlowRun per (phone, flowType, mpl) — a new requestId for an
    // existing exact match is a new attempt on the same record, not a new
    // row; a difference in any of the three fields is a separate record.
    const flowRun = existing
      ? await this.prisma.flowRun.update({
          where: { id: existing.id },
          data: {
            requestId,
            name: fullName,
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

    const skipped = await this.dispatchService.skipIfCtaCompleted(flowRun);
    if (skipped) return { flowRun: skipped, outcome };

    if (config.sendSchedule) {
      // Batched: leave it at Received — the flow's cron dispatch job will
      // send it at the next scheduled time.
      return { flowRun, outcome };
    }

    const dispatched = await this.dispatchService.dispatchOne(flowRun, config);
    if (dispatched.status === FlowRunStatus.Failed) {
      throw new Error(dispatched.errorMessage ?? "Preliminary SMS failed");
    }
    return { flowRun: dispatched, outcome };
  }

  /**
   * N8N tells us (via its own separate check) that a client completed the
   * CTA. Correlated by (phone, flow, mpl) — the same triple used to
   * identify a FlowRun on ingest, since a phone+flow pair alone no longer
   * pins down a single record (two mpls can share a phone within a flow).
   */
  async handleCtaComplete(dto: CtaCompleteWebhookDto): Promise<void> {
    const flowRun = await this.prisma.flowRun.findUnique({
      where: { phone_flowType_mpl: { phone: dto.phone, flowType: dto.flow, mpl: dto.mpl } },
    });

    if (!flowRun) {
      this.logger.warn(
        `No FlowRun found for phone=${dto.phone} flow=${dto.flow} mpl=${dto.mpl} — cta-complete webhook ignored`,
      );
      return;
    }

    await this.prisma.flowRun.update({
      where: { id: flowRun.id },
      data: {
        ctaCompleted: dto.cta_complete,
        ctaCompletedAt: dto.cta_complete ? new Date() : null,
        events: {
          create: { status: flowRun.status, detail: `CTA completed=${dto.cta_complete} (via N8N)` },
        },
      },
    });
  }
}
