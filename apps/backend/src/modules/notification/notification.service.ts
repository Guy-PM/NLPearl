import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

/**
 * Client for PayMe's Notification Gateway (the same n8n-fronted webhook
 * used elsewhere at PayMe for outbound email/SMS — see the
 * migrate-mailgun skill for the `send_email` shape this mirrors).
 *
 * The exact SMS payload fields below (`phone`, `text_content`) are our
 * best guess from the confirmed `send_email` shape and need confirming
 * with whoever owns the gateway before relying on this in production.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly config: ConfigService) {}

  async sendSms(phone: string, text: string): Promise<void> {
    const url = this.config.getOrThrow<string>("NOTIFICATION_GATEWAY_URL");
    const apiKey = this.config.getOrThrow<string>("NOTIFICATION_GATEWAY_API_KEY");

    await axios.post(
      url,
      {
        actions: ["send_sms"],
        phone,
        text_content: text,
      },
      {
        headers: {
          "X-API-Key": apiKey,
          "Content-Type": "application/json",
        },
        timeout: 10_000,
      },
    );

    this.logger.log(`SMS queued via Notification Gateway for ${phone}`);
  }
}
