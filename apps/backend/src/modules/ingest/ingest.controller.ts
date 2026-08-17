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
      duplicate: `A record for phone "${flowRun.phone}", flow "${flowRun.flowType}", mpl "${flowRun.mpl}" already exists — no new SMS/call was triggered. Use a different requestId to force a new attempt on this same record.`,
      updated: `Phone "${flowRun.phone}" already has a record on flow "${flowRun.flowType}" with mpl "${flowRun.mpl}" — this submission updated that existing record (same id) instead of creating a new one. A different mpl or flowType would have created a separate record.`,
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
