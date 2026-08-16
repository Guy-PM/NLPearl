import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

interface NotificationGatewayResponse {
  email_success?: boolean;
  sms_success?: boolean;
  uuid: string;
}

/**
 * Client for PayMe's Notification Gateway — a single n8n-fronted webhook
 * that dispatches to Mailgun/InforuMobile and logs to NocoDB. See the
 * gateway's own API docs: auth is `X-API-Key`, the SMS body goes in
 * `sms_content` (not `text_content` — that field is email-only, though
 * the gateway falls back to it if `sms_content` is blank).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(phone: string, text: string): Promise<string> {
    const url = this.config.getOrThrow<string>("NOTIFICATION_GATEWAY_URL");
    const apiKey = this.config.getOrThrow<string>("NOTIFICATION_GATEWAY_API_KEY");

    const { data } = await axios.post<NotificationGatewayResponse>(
      url,
      {
        actions: ["send_sms"],
        phone,
        sms_content: text,
      },
      {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      },
    );

    if (!data.sms_success) {
      throw new InternalServerErrorException(
        `Notification Gateway reported sms_success=false (uuid=${data.uuid})`,
      );
    }

    this.logger.log(`SMS sent via Notification Gateway for ${phone} (uuid=${data.uuid})`);
    return data.uuid;
  }
}
