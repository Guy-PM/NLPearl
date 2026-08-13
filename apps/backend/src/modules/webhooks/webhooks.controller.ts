import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { createApiKeyGuard } from "../../common/guards/api-key.guard";
import { NlpearlCallEndedWebhookDto, NlpearlConsentWebhookDto } from "./dto/nlpearl-webhooks.dto";
import { WebhooksService } from "./webhooks.service";

@Controller("webhooks/nlpearl")
@UseGuards(createApiKeyGuard("NLPEARL_WEBHOOK_API_KEY"))
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post("consent")
  @HttpCode(200)
  async consent(@Body() dto: NlpearlConsentWebhookDto) {
    await this.webhooksService.handleConsent(dto);
    return { received: true };
  }

  @Post("call-ended")
  @HttpCode(200)
  async callEnded(@Body() dto: NlpearlCallEndedWebhookDto) {
    await this.webhooksService.handleCallEnded(dto);
    return { received: true };
  }
}
