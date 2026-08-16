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
    attemptCount: 1,
  };
  const config = {
    flowType: "kyc_reminder",
    consentSmsTemplate: "Link: {{cfaUrl}}",
    maxRetryAttempts: 0,
    retryOnCallStatuses: null,
    retryOnConversationStatuses: null,
    retryMinCallDurationSeconds: null,
  };

  let prisma: any;
  let flowConfigService: any;
  let nlpearlService: any;
  let notificationService: any;
  let transitions: any;
  let dispatchService: any;
  let service: WebhooksService;

  beforeEach(() => {
    prisma = {
      flowRun: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      nlpearlCall: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
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
    dispatchService = { scheduleRetry: jest.fn().mockResolvedValue(undefined) };

    service = new WebhooksService(
      prisma,
      flowConfigService,
      nlpearlService,
      notificationService,
      transitions,
      dispatchService,
    );
  });

  describe("handleConsent", () => {
    it("sends the consent SMS and transitions the matching FlowRun to ConsentGiven", async () => {
      prisma.flowRun.findUnique.mockResolvedValue(flowRun);

      await service.handleConsent({ mpl: "mpl-1", phone: "+15550001", flowType: "kyc_reminder" });

      expect(notificationService.sendSms).toHaveBeenCalledWith(
        "+15550001",
        "Link: https://cfa.example/1",
      );
      expect(transitions.transition).toHaveBeenCalledWith("run-1", FlowRunStatus.ConsentGiven);
    });

    it("does nothing when no matching CallTriggered FlowRun is found", async () => {
      prisma.flowRun.findUnique.mockResolvedValue(null);

      await service.handleConsent({ mpl: "unknown", phone: "+1", flowType: "kyc_reminder" });

      expect(notificationService.sendSms).not.toHaveBeenCalled();
      expect(transitions.transition).not.toHaveBeenCalled();
    });

    it("does nothing when the FlowRun exists but isn't CallTriggered", async () => {
      prisma.flowRun.findUnique.mockResolvedValue({ ...flowRun, status: FlowRunStatus.Completed });

      await service.handleConsent({ mpl: "mpl-1", phone: "+15550001", flowType: "kyc_reminder" });

      expect(notificationService.sendSms).not.toHaveBeenCalled();
    });
  });

  describe("handleCallEnded", () => {
    it("ignores the call-started delivery of the webhook", async () => {
      await service.handleCallEnded({ id: "call-1", status: "InProgress" });

      expect(prisma.flowRun.findFirst).not.toHaveBeenCalled();
      expect(nlpearlService.getCall).not.toHaveBeenCalled();
    });

    it("fetches full call details and completes the pending NlpearlCall + FlowRun", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(flowRun);
      prisma.nlpearlCall.findFirst.mockResolvedValue({ id: "call-row-1" });

      await service.handleCallEnded({ id: "call-1", to: "+15550001", status: "Completed" });

      expect(nlpearlService.getCall).toHaveBeenCalledWith("call-1");
      expect(prisma.nlpearlCall.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "call-row-1" },
          data: expect.objectContaining({
            nlpearlCallId: "call-1",
            duration: 42,
            summary: "Client agreed to KYC",
            recordingUrl: "https://recording.example/call-1",
          }),
        }),
      );
      expect(transitions.transition).toHaveBeenCalledWith("run-1", FlowRunStatus.Completed, "call-1");
    });

    it("creates a new NlpearlCall row if no pending one is found", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(flowRun);
      prisma.nlpearlCall.findFirst.mockResolvedValue(null);

      await service.handleCallEnded({ id: "call-1", to: "+15550001", status: "Completed" });

      expect(prisma.nlpearlCall.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ flowRunId: "run-1", nlpearlCallId: "call-1" }) }),
      );
    });

    it("does nothing when no matching FlowRun can be correlated by phone", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(null);

      await service.handleCallEnded({ id: "call-1", to: "+19998887777", status: "Completed" });

      expect(nlpearlService.getCall).not.toHaveBeenCalled();
      expect(prisma.nlpearlCall.update).not.toHaveBeenCalled();
      expect(prisma.nlpearlCall.create).not.toHaveBeenCalled();
    });

    it("schedules a retry instead of completing when the call qualifies under the flow's retry rules", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(flowRun);
      flowConfigService.findByFlowType.mockResolvedValue({
        ...config,
        maxRetryAttempts: 2,
        retryOnCallStatuses: "4,5,6,7",
      });

      await service.handleCallEnded({ id: "call-1", to: "+15550001", status: "Failed" });

      expect(dispatchService.scheduleRetry).toHaveBeenCalledWith(
        flowRun,
        expect.objectContaining({ maxRetryAttempts: 2 }),
        expect.any(String),
      );
      expect(transitions.transition).not.toHaveBeenCalledWith("run-1", FlowRunStatus.Completed, expect.anything());
    });

    it("completes normally when retries are disabled (maxRetryAttempts=0)", async () => {
      prisma.flowRun.findFirst.mockResolvedValue(flowRun);

      await service.handleCallEnded({ id: "call-1", to: "+15550001", status: "Completed" });

      expect(dispatchService.scheduleRetry).not.toHaveBeenCalled();
      expect(transitions.transition).toHaveBeenCalledWith("run-1", FlowRunStatus.Completed, "call-1");
    });
  });
});
