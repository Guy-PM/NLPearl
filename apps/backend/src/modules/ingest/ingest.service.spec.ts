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
    sendSchedule: null,
    enabled: true,
  };

  let prisma: any;
  let flowConfigService: any;
  let dispatchService: any;
  let enrichment: any;
  let service: IngestService;

  beforeEach(() => {
    prisma = {
      flowRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: "run-1", ...data })),
        update: jest.fn().mockImplementation(({ data }) => ({ id: "run-existing", ...data })),
      },
    };
    flowConfigService = { findByFlowType: jest.fn().mockResolvedValue(config) };
    dispatchService = {
      dispatchOne: jest.fn().mockImplementation((flowRun) => ({
        ...flowRun,
        status: FlowRunStatus.Scheduled,
      })),
    };
    enrichment = { enrich: jest.fn().mockImplementation((record) => Promise.resolve(record)) };

    service = new IngestService(prisma, flowConfigService, dispatchService, enrichment);
  });

  it("creates a FlowRun and dispatches it immediately when no sendSchedule is set", async () => {
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
    expect(dispatchService.dispatchOne).toHaveBeenCalledWith(
      expect.objectContaining({ id: "run-1" }),
      config,
    );
    expect(result.status).toBe(FlowRunStatus.Scheduled);
  });

  it("leaves the FlowRun at Received without dispatching when the flow has a sendSchedule", async () => {
    flowConfigService.findByFlowType.mockResolvedValue({ ...config, sendSchedule: "0 10 * * *" });

    const result = await service.handleFlowTrigger(dto, {});

    expect(dispatchService.dispatchOne).not.toHaveBeenCalled();
    expect(result.status).toBe(FlowRunStatus.Received);
  });

  it("is idempotent: a duplicate requestId short-circuits without side effects", async () => {
    const existing = { id: "run-existing", requestId: "dup" };
    prisma.flowRun.findUnique.mockResolvedValue(existing);

    const result = await service.handleFlowTrigger({ ...dto, requestId: "dup" }, {});

    expect(result).toBe(existing);
    expect(prisma.flowRun.create).not.toHaveBeenCalled();
    expect(dispatchService.dispatchOne).not.toHaveBeenCalled();
  });

  it("treats a different requestId for the same mpl+flowType as a new attempt on the same row", async () => {
    const existing = { id: "run-existing", requestId: "old-request", mpl: "mpl-1", flowType: "kyc_reminder" };
    prisma.flowRun.findUnique.mockResolvedValue(existing);

    const result = await service.handleFlowTrigger({ ...dto, requestId: "new-request" }, {});

    expect(prisma.flowRun.create).not.toHaveBeenCalled();
    expect(prisma.flowRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-existing" },
        data: expect.objectContaining({
          requestId: "new-request",
          status: FlowRunStatus.Received,
          errorMessage: null,
        }),
      }),
    );
    expect(dispatchService.dispatchOne).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("rejects records for a disabled flow before creating a FlowRun", async () => {
    flowConfigService.findByFlowType.mockResolvedValue({ ...config, enabled: false });

    await expect(service.handleFlowTrigger(dto, {})).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.flowRun.create).not.toHaveBeenCalled();
  });

  it("throws when dispatchOne reports a Failed FlowRun (e.g. the preliminary SMS failed)", async () => {
    dispatchService.dispatchOne.mockResolvedValue({
      id: "run-1",
      status: FlowRunStatus.Failed,
      errorMessage: "Preliminary SMS failed: gateway down",
    });

    await expect(service.handleFlowTrigger(dto, {})).rejects.toThrow("gateway down");
  });
});
