import { Body, Controller, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { createApiKeyGuard } from "../../common/guards/api-key.guard";
import { CtaCompleteWebhookDto } from "./dto/cta-complete-webhook.dto";
import { FlowTriggerDto } from "./dto/flow-trigger.dto";
import { IngestService } from "./ingest.service";

@Controller("webhooks/n8n")
@UseGuards(createApiKeyGuard("N8N_WEBHOOK_API_KEY"))
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post("flow-trigger")
  async flowTrigger(@Body() dto: FlowTriggerDto, @Req() req: Request) {
    // `dto` is whitelisted/validated; `req.body` is the raw N8N payload,
    // kept verbatim on FlowRun.rawPayload so nothing sent by N8N is lost.
    const { flowRun, outcome } = await this.ingestService.handleFlowTrigger(dto, req.body);
    const messages: Record<"duplicate" | "updated", string> = {
      duplicate: `A record for phone "${flowRun.phone}" already exists on flow "${flowRun.flowType}" — no new SMS/call was triggered. Use a different requestId to force a new attempt, or submit under a different flowType for a separate record.`,
      updated: `Phone "${flowRun.phone}" already has a record on flow "${flowRun.flowType}" — this submission updated that existing record (same id) instead of creating a new one. Submit under a different flowType if this should be a separate record.`,
    };
    return {
      id: flowRun.id,
      status: flowRun.status,
      duplicate: outcome === "duplicate",
      ...(outcome === "created" ? {} : { message: messages[outcome] }),
    };
  }

  @Post("cta-complete")
  @HttpCode(200)
  async ctaComplete(@Body() dto: CtaCompleteWebhookDto) {
    await this.ingestService.handleCtaComplete(dto);
    return { received: true };
  }
}
