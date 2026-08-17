import { NotFoundException } from "@nestjs/common";
import { FlowRunsService } from "./flow-runs.service";

describe("FlowRunsService", () => {
  let prisma: any;
  let flowConfigService: any;
  let dispatchService: any;
  let service: FlowRunsService;

  beforeEach(() => {
    prisma = {
      flowRun: {
        findUnique: jest.fn(),
        delete: jest.fn().mockResolvedValue({}),
      },
    };
    flowConfigService = { findByFlowType: jest.fn() };
    dispatchService = { resendNow: jest.fn() };

    service = new FlowRunsService(prisma, flowConfigService, dispatchService);
  });

  describe("remove", () => {
    it("deletes the FlowRun (events/calls cascade via the DB relation) and returns confirmation", async () => {
      prisma.flowRun.findUnique.mockResolvedValue({ id: "run-1" });

      const result = await service.remove("run-1");

      expect(prisma.flowRun.delete).toHaveBeenCalledWith({ where: { id: "run-1" } });
      expect(result).toEqual({ id: "run-1", deleted: true });
    });

    it("throws NotFoundException when the record doesn't exist", async () => {
      prisma.flowRun.findUnique.mockResolvedValue(null);

      await expect(service.remove("missing")).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.flowRun.delete).not.toHaveBeenCalled();
    });
  });
});
