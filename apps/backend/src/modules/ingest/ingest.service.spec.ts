import { BadRequestException } from "@nestjs/common";
import { FlowRunStatus } from "@nlpearl/database";
import { IngestService } from "./ingest.service";
import { FlowTriggerDto } from "./dto/flow-trigger.dto";

describe("IngestService", () => {
  const dto: FlowTriggerDto = {
    flowType: "kyc_reminder",
    name: "Ana",
    phone: "+15550001",
    mpl: "mpl-1",
    cfaUrl: "https://cfa.example/1",
  };

  const config = {
    flowType: "kyc_reminder",
    nlpearlOutboundId: "outbound-1",
    preliminarySmsTemplate: "Hi {{name}}",
    consentSmsTemplate: "Link: {{cfaUrl}}",
    delayMinutes: 10,
    enabled: true,
  };

  let prisma: any;
  let flowConfigService: any;
  let notificationService: any;
  let scheduler: any;
  let transitions: any;
  let enrichment: any;
  let service: IngestService;

  beforeEach(() => {
    prisma = {
      flowRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({
          id: "run-1",
          ...data,
        })),
      },
    };
    flowConfigService = { findByFlowType: jest.fn().mockResolvedValue(config) };
    notificationService = { sendSms: jest.fn().mockResolvedValue(undefined) };
    scheduler = { enqueueDelayed: jest.fn().mockResolvedValue("job-1") };
    transitions = {
      transition: jest.fn().mockImplementation((id, status) => ({ id, status })),
      fail: jest.fn().mockImplementation((id, errorMessage) => ({ id, status: FlowRunStatus.Failed, errorMessage })),
    };
    enrichment = { enrich: jest.fn().mockImplementation((record) => Promise.resolve(record)) };

    service = new IngestService(
      prisma,
      flowConfigService,
      notificationService,
      scheduler,
      transitions,
      enrichment,
    );
  });

  it("creates a FlowRun, sends the preliminary SMS, and schedules the call trigger", async () => {
    const result = await service.handleFlowTrigger(dto, { raw: true });

    expect(prisma.flowRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          requestId: "kyc_reminder:mpl-1:" + new Date().toISOString().slice(0, 10),
          flowType: "kyc_reminder",
          status: FlowRunStatus.Received,
        }),
      }),
    );
    expect(notificationService.sendSms).toHaveBeenCalledWith("+15550001", "Hi Ana");
    expect(scheduler.enqueueDelayed).toHaveBeenCalledWith(
      "trigger-nlpearl-call",
      { flowRunId: "run-1" },
      10 * 60,
    );
    expect(transitions.transition).toHaveBeenCalledWith("run-1", FlowRunStatus.PreSmsSent);
    expect(transitions.transition).toHaveBeenCalledWith("run-1", FlowRunStatus.Scheduled);
    expect(result).toBeDefined();
  });

  it("is idempotent: a duplicate requestId short-circuits without side effects", async () => {
    const existing = { id: "run-existing", requestId: "dup" };
    prisma.flowRun.findUnique.mockResolvedValue(existing);

    const result = await service.handleFlowTrigger({ ...dto, requestId: "dup" }, {});

    expect(result).toBe(existing);
    expect(prisma.flowRun.create).not.toHaveBeenCalled();
    expect(notificationService.sendSms).not.toHaveBeenCalled();
    expect(scheduler.enqueueDelayed).not.toHaveBeenCalled();
  });

  it("rejects records for a disabled flow before creating a FlowRun", async () => {
    flowConfigService.findByFlowType.mockResolvedValue({ ...config, enabled: false });

    await expect(service.handleFlowTrigger(dto, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.flowRun.create).not.toHaveBeenCalled();
  });

  it("marks the FlowRun Failed and rethrows when the preliminary SMS fails", async () => {
    notificationService.sendSms.mockRejectedValue(new Error("gateway down"));

    await expect(service.handleFlowTrigger(dto, {})).rejects.toThrow("gateway down");
    expect(transitions.fail).toHaveBeenCalledWith("run-1", expect.stringContaining("gateway down"));
    expect(scheduler.enqueueDelayed).not.toHaveBeenCalled();
  });
});
