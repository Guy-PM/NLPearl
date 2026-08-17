import { FlowRunStatus } from "@nlpearl/database";
import { CallTriggerWorker } from "./call-trigger.worker";
import { TRIGGER_NLPEARL_CALL_JOB } from "./ingest.constants";

describe("CallTriggerWorker", () => {
  const flowRun = {
    id: "run-1",
    flowType: "kyc_reminder",
    phone: "+15550001",
    name: "Ana",
    mpl: "mpl-1",
    cfaUrl: "https://cfa.example/1",
    attemptCount: 1,
  };
  const config = { flowType: "kyc_reminder", nlpearlOutboundId: "outbound-1" };

  let prisma: any;
  let flowConfigService: any;
  let nlpearlService: any;
  let scheduler: any;
  let transitions: any;
  let dispatchService: any;
  let worker: CallTriggerWorker;
  let registeredHandler: (data: { flowRunId: string }) => Promise<void>;

  beforeEach(async () => {
    prisma = {
      flowRun: {
        findUnique: jest.fn().mockResolvedValue(flowRun),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    flowConfigService = { findByFlowType: jest.fn().mockResolvedValue(config) };
    nlpearlService = { makeCall: jest.fn().mockResolvedValue({ id: "call-request-1" }) };
    scheduler = {
      registerWorker: jest.fn().mockImplementation((_job, handler) => {
        registeredHandler = handler;
        return Promise.resolve();
      }),
    };
    transitions = { fail: jest.fn().mockResolvedValue({}), transition: jest.fn().mockResolvedValue({}) };
    dispatchService = {
      skipIfCtaCompleted: jest.fn().mockResolvedValue(null),
      scheduleRetry: jest.fn().mockResolvedValue(undefined),
    };

    worker = new CallTriggerWorker(prisma, flowConfigService, nlpearlService, scheduler, transitions, dispatchService);
    await worker.onModuleInit();
  });

  it("registers a worker for the trigger-call job on init", () => {
    expect(scheduler.registerWorker).toHaveBeenCalledWith(TRIGGER_NLPEARL_CALL_JOB, expect.any(Function));
  });

  it("triggers the NLPearl call with the FlowRun's data and marks it CallTriggered", async () => {
    await registeredHandler({ flowRunId: "run-1" });

    expect(nlpearlService.makeCall).toHaveBeenCalledWith("outbound-1", {
      to: "+15550001",
      callData: { name: "Ana", mpl: "mpl-1", cfaUrl: "https://cfa.example/1", flowType: "kyc_reminder" },
    });
    expect(prisma.flowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1" },
        data: expect.objectContaining({
          status: FlowRunStatus.CallTriggered,
          calls: { create: { nlpearlCallRequestId: "call-request-1" } },
        }),
      }),
    );
  });

  it("marks the FlowRun Failed if the NLPearl call trigger fails and the flow has no retries configured", async () => {
    nlpearlService.makeCall.mockRejectedValue(new Error("NLPearl 500"));

    await expect(registeredHandler({ flowRunId: "run-1" })).resolves.toBeUndefined();
    expect(transitions.fail).toHaveBeenCalledWith("run-1", expect.stringContaining("NLPearl 500"));
    expect(dispatchService.scheduleRetry).not.toHaveBeenCalled();
  });

  it("schedules an auto-retry when the call trigger fails and the flow's retry attempts aren't exhausted", async () => {
    const retryConfig = { ...config, maxRetryAttempts: 2 };
    flowConfigService.findByFlowType.mockResolvedValue(retryConfig);
    nlpearlService.makeCall.mockRejectedValue(new Error("Outbound is inactive"));

    await registeredHandler({ flowRunId: "run-1" });

    expect(dispatchService.scheduleRetry).toHaveBeenCalledWith(
      flowRun,
      retryConfig,
      expect.stringContaining("Outbound is inactive"),
    );
    expect(transitions.fail).not.toHaveBeenCalled();
  });

  it("marks the FlowRun Failed once retry attempts are exhausted, even with retries configured", async () => {
    flowConfigService.findByFlowType.mockResolvedValue({ ...config, maxRetryAttempts: 1 });
    prisma.flowRun.findUnique.mockResolvedValue({ ...flowRun, attemptCount: 2 });
    nlpearlService.makeCall.mockRejectedValue(new Error("Outbound is inactive"));

    await registeredHandler({ flowRunId: "run-1" });

    expect(transitions.fail).toHaveBeenCalledWith("run-1", expect.stringContaining("Outbound is inactive"));
    expect(dispatchService.scheduleRetry).not.toHaveBeenCalled();
  });

  it("does nothing if the FlowRun no longer exists", async () => {
    prisma.flowRun.findUnique.mockResolvedValue(null);

    await registeredHandler({ flowRunId: "missing" });

    expect(nlpearlService.makeCall).not.toHaveBeenCalled();
    expect(prisma.flowRun.update).not.toHaveBeenCalled();
  });

  it("skips the call when MessageDispatchService reports the CTA was already completed", async () => {
    const ctaCompletedFlowRun = { ...flowRun, ctaCompleted: true, status: FlowRunStatus.Completed };
    prisma.flowRun.findUnique.mockResolvedValue(ctaCompletedFlowRun);
    dispatchService.skipIfCtaCompleted.mockResolvedValue(ctaCompletedFlowRun);

    await registeredHandler({ flowRunId: "run-1" });

    expect(dispatchService.skipIfCtaCompleted).toHaveBeenCalledWith(ctaCompletedFlowRun);
    expect(nlpearlService.makeCall).not.toHaveBeenCalled();
    expect(prisma.flowRun.update).not.toHaveBeenCalled();
  });
});
