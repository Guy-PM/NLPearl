import { BadRequestException } from "@nestjs/common";
import { FlowRunStatus } from "@nlpearl/database";
import { IngestService } from "./ingest.service";
import { FlowTriggerDto } from "./dto/flow-trigger.dto";

describe("IngestService", () => {
  const dto: FlowTriggerDto = {
    flowType: "kyc_reminder",
    name: "Ana",
    first_name: "Ana",
    last_name: "Test",
    partner: "test-partner",
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
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(({ data }) => ({ id: "run-1", ...data })),
        update: jest.fn().mockImplementation(({ where, data }) => ({ id: where.id ?? "run-existing", ...data })),
      },
    };
    flowConfigService = { findByFlowType: jest.fn().mockResolvedValue(config) };
    dispatchService = {
      dispatchOne: jest.fn().mockImplementation((flowRun) => ({
        ...flowRun,
        status: FlowRunStatus.Scheduled,
      })),
      skipIfCtaCompleted: jest.fn().mockResolvedValue(null),
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
    expect(result.flowRun.status).toBe(FlowRunStatus.Scheduled);
    expect(result.outcome).toBe("created");
  });

  it("leaves the FlowRun at Received without dispatching when the flow has a sendSchedule", async () => {
    flowConfigService.findByFlowType.mockResolvedValue({ ...config, sendSchedule: "0 10 * * *" });

    const result = await service.handleFlowTrigger(dto, {});

    expect(dispatchService.dispatchOne).not.toHaveBeenCalled();
    expect(result.flowRun.status).toBe(FlowRunStatus.Received);
  });

  it("is idempotent: a duplicate requestId short-circuits without side effects", async () => {
    const existing = { id: "run-existing", requestId: "dup" };
    prisma.flowRun.findUnique.mockResolvedValue(existing);

    const result = await service.handleFlowTrigger({ ...dto, requestId: "dup" }, {});

    expect(result.flowRun).toBe(existing);
    expect(result.outcome).toBe("duplicate");
    expect(prisma.flowRun.create).not.toHaveBeenCalled();
    expect(dispatchService.dispatchOne).not.toHaveBeenCalled();
  });

  it("treats a different requestId for the same phone+flowType as a new attempt on the same row", async () => {
    const existing = { id: "run-existing", requestId: "old-request", phone: "+15550001", flowType: "kyc_reminder" };
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
    expect(result.flowRun).toBeDefined();
    expect(result.outcome).toBe("updated");
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

  it("skips dispatch entirely (no SMS) when the record's CTA is already completed", async () => {
    const completed = { id: "run-1", status: FlowRunStatus.Completed };
    dispatchService.skipIfCtaCompleted.mockResolvedValue(completed);

    const result = await service.handleFlowTrigger(dto, {});

    expect(dispatchService.skipIfCtaCompleted).toHaveBeenCalled();
    expect(dispatchService.dispatchOne).not.toHaveBeenCalled();
    expect(result.flowRun).toBe(completed);
  });

  describe("handleCtaComplete", () => {
    it("marks the matching FlowRun (correlated by phone+flow+mpl) as CTA completed", async () => {
      const matched = {
        id: "run-1",
        phone: "+15550001",
        flowType: "kyc_reminder",
        mpl: "mpl-1",
        status: FlowRunStatus.Scheduled,
      };
      prisma.flowRun.findUnique.mockResolvedValue(matched);

      await service.handleCtaComplete({ phone: "+15550001", flow: "kyc_reminder", mpl: "mpl-1", cta_complete: true });

      expect(prisma.flowRun.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { phone_flowType_mpl: { phone: "+15550001", flowType: "kyc_reminder", mpl: "mpl-1" } },
        }),
      );
      expect(prisma.flowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "run-1" },
          data: expect.objectContaining({
            ctaCompleted: true,
            ctaCompletedAt: expect.any(Date),
          }),
        }),
      );
    });

    it("does nothing when no FlowRun matches the phone+flow+mpl", async () => {
      prisma.flowRun.findUnique.mockResolvedValue(null);

      await service.handleCtaComplete({ phone: "+19998887777", flow: "kyc_reminder", mpl: "mpl-x", cta_complete: true });

      expect(prisma.flowRun.update).not.toHaveBeenCalled();
    });

    it("clears ctaCompletedAt when cta_complete is false", async () => {
      const matched = {
        id: "run-1",
        phone: "+15550001",
        flowType: "kyc_reminder",
        mpl: "mpl-1",
        status: FlowRunStatus.Scheduled,
      };
      prisma.flowRun.findUnique.mockResolvedValue(matched);

      await service.handleCtaComplete({ phone: "+15550001", flow: "kyc_reminder", mpl: "mpl-1", cta_complete: false });

      expect(prisma.flowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ ctaCompleted: false, ctaCompletedAt: null }),
        }),
      );
    });
  });
});
