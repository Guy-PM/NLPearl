import { FlowRunStatus } from "@nlpearl/database";
import { WebhooksService } from "./webhooks.service";

describe("WebhooksService", () => {
  const flowRun = {
    id: "run-1",
    mpl: "mpl-1",
    phone: "+15550001",
    flowType: "kyc_reminder",
    cfaUrl: "https://cfa.example/1",
    status: FlowRunStatus.CallTriggered,
  };
  const config = {
    flowType: "kyc_reminder",
    consentSmsTemplate: "Link: {{cfaUrl}}",
  };

  let prisma: any;
  let flowConfigService: any;
  let nlpearlService: any;
  let notificationService: any;
  let transitions: any;
  let service: WebhooksService;

  beforeEach(() => {
    prisma = {
      flowRun: {
        findFirst: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    flowConfigService = { findByFlowType: jest.fn().mockResolvedValue(config) };
    nlpearlService = {
      getCall: jest.fn().mockResolvedValue({
        id: "call-1",
        status: 4,
        conversationStatus: 100,
        duration: 42,
        summary: "Client agreed to KYC",
        recording: "https://recording.example/call-1",
        collectedInfo: { agreed: true },
      }),
    };
    notificationService = { sendSms: jest.fn().mockResolvedValue(undefined) };
    transitions = { transition: jest.fn().mockResolvedValue({}) };

    service = new WebhooksService(prisma, flowConfigService, nlpearlService, notificationService, transitions);
  });

  describe("handleConsent", () => {
    it("sends the consent SMS and transitions the matching FlowRun to ConsentGiven", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(flowRun);

      await service.handleConsent({ mpl: "mpl-1", phone: "+15550001", flowType: "kyc_reminder" });

      expect(notificationService.sendSms).toHaveBeenCalledWith(
        "+15550001",
        "Link: https://cfa.example/1",
      );
      expect(transitions.transition).toHaveBeenCalledWith("run-1", FlowRunStatus.ConsentGiven);
    });

    it("does nothing when no matching CallTriggered FlowRun is found", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(null);

      await service.handleConsent({ mpl: "unknown", phone: "+1", flowType: "kyc_reminder" });

      expect(notificationService.sendSms).not.toHaveBeenCalled();
      expect(transitions.transition).not.toHaveBeenCalled();
    });
  });

  describe("handleCallEnded", () => {
    it("ignores the call-started delivery of the webhook", async () => {
      await service.handleCallEnded({ id: "call-1", status: "InProgress" });

      expect(prisma.flowRun.findFirst).not.toHaveBeenCalled();
      expect(nlpearlService.getCall).not.toHaveBeenCalled();
    });

    it("fetches full call details and marks the matching FlowRun Completed", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(flowRun);

      await service.handleCallEnded({ id: "call-1", to: "+15550001", status: "Completed" });

      expect(nlpearlService.getCall).toHaveBeenCalledWith("call-1");
      expect(prisma.flowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "run-1" },
          data: expect.objectContaining({
            nlpearlCallId: "call-1",
            duration: 42,
            summary: "Client agreed to KYC",
            recordingUrl: "https://recording.example/call-1",
            status: FlowRunStatus.Completed,
          }),
        }),
      );
    });

    it("does nothing when no matching FlowRun can be correlated by phone", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(null);

      await service.handleCallEnded({ id: "call-1", to: "+19998887777", status: "Completed" });

      expect(nlpearlService.getCall).not.toHaveBeenCalled();
      expect(prisma.flowRun.update).not.toHaveBeenCalled();
    });
  });
});
