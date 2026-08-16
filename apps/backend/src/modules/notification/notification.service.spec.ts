import axios from "axios";
import { ConfigService } from "@nestjs/config";
import { NotificationService } from "./notification.service";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("NotificationService", () => {
  const config = {
    getOrThrow: (key: string) =>
      ({
        NOTIFICATION_GATEWAY_URL: "https://n8n.payme.io/webhook/60e2eea1-a7b2-4f6d-8786-4bea2d0f383c",
        NOTIFICATION_GATEWAY_API_KEY: "secret-key",
      })[key],
  } as ConfigService;

  let service: NotificationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotificationService(config);
  });

  it("posts the gateway's documented SMS payload shape and headers", async () => {
    mockedAxios.post.mockResolvedValue({ data: { sms_success: true, uuid: "abc-123" } });

    const uuid = await service.sendSms("+15550001", "Hi there");

    expect(mockedAxios.post).toHaveBeenCalledWith(
      "https://n8n.payme.io/webhook/60e2eea1-a7b2-4f6d-8786-4bea2d0f383c",
      { actions: ["send_sms"], phone: "+15550001", sms_content: "Hi there" },
      expect.objectContaining({
        headers: { "X-API-Key": "secret-key", "Content-Type": "application/json" },
      }),
    );
    expect(uuid).toBe("abc-123");
  });

  it("throws when the gateway reports sms_success=false", async () => {
    mockedAxios.post.mockResolvedValue({ data: { sms_success: false, uuid: "abc-456" } });

    await expect(service.sendSms("+15550001", "Hi there")).rejects.toThrow(/sms_success=false/);
  });
});
