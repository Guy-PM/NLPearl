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
  };
  const config = { flowType: "kyc_reminder", nlpearlOutboundId: "outbound-1" };

  let prisma: any;
  let flowConfigService: any;
  let nlpearlService: any;
  let scheduler: any;
  let transitions: any;
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
    transitions = { fail: jest.fn().mockResolvedValue({}) };

    worker = new CallTriggerWorker(prisma, flowConfigService, nlpearlService, scheduler, transitions);
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

  it("marks the FlowRun Failed if the NLPearl call trigger fails, without throwing", async () => {
    nlpearlService.makeCall.mockRejectedValue(new Error("NLPearl 500"));

    await expect(registeredHandler({ flowRunId: "run-1" })).resolves.toBeUndefined();
    expect(transitions.fail).toHaveBeenCalledWith("run-1", expect.stringContaining("NLPearl 500"));
  });

  it("does nothing if the FlowRun no longer exists", async () => {
    prisma.flowRun.findUnique.mockResolvedValue(null);

    await registeredHandler({ flowRunId: "missing" });

    expect(nlpearlService.makeCall).not.toHaveBeenCalled();
    expect(prisma.flowRun.update).not.toHaveBeenCalled();
  });
});
