import { FlowRunStatus } from "@nlpearl/database";
import { MessageDispatchService } from "./message-dispatch.service";

describe("MessageDispatchService", () => {
  const flowRun = {
    id: "run-1",
    flowType: "kyc_reminder",
    phone: "+15550001",
    name: "Ana",
    rawPayload: { name: "Ana" },
    attemptCount: 1,
  };
  const config = {
    flowType: "kyc_reminder",
    preliminarySmsTemplate: "Hi {{name}}",
    delayMinutes: 10,
    retryDelayMinutes: null,
    sendSchedule: null,
    sendTimezone: "Asia/Jerusalem",
    enabled: true,
  };

  let prisma: any;
  let notificationService: any;
  let scheduler: any;
  let service: MessageDispatchService;

  beforeEach(() => {
    prisma = {
      flowConfig: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn() },
      flowRun: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn().mockImplementation(({ where, data }) => ({ ...flowRun, ...data, id: where.id })),
      },
    };
    notificationService = { sendSms: jest.fn().mockResolvedValue(undefined) };
    scheduler = {
      enqueueDelayed: jest.fn().mockResolvedValue("job-1"),
      registerWorker: jest.fn().mockResolvedValue(undefined),
      scheduleCron: jest.fn().mockResolvedValue(undefined),
      unschedule: jest.fn().mockResolvedValue(undefined),
    };

    service = new MessageDispatchService(prisma, notificationService, scheduler);
  });

  describe("dispatchOne", () => {
    it("sends the SMS, schedules the delayed call trigger, and marks Scheduled", async () => {
      const result = await service.dispatchOne(flowRun as any, config as any);

      expect(notificationService.sendSms).toHaveBeenCalledWith("+15550001", "Hi Ana");
      expect(scheduler.enqueueDelayed).toHaveBeenCalledWith("trigger-nlpearl-call", { flowRunId: "run-1" }, 600);
      expect(result.status).toBe(FlowRunStatus.Scheduled);
    });

    it("marks Failed and does not schedule a call when the SMS send fails", async () => {
      notificationService.sendSms.mockRejectedValue(new Error("gateway down"));

      const result = await service.dispatchOne(flowRun as any, config as any);

      expect(prisma.flowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: FlowRunStatus.Failed, errorMessage: expect.stringContaining("gateway down") }),
        }),
      );
      expect(scheduler.enqueueDelayed).not.toHaveBeenCalled();
      expect(result.status).toBe(FlowRunStatus.Failed);
    });
  });

  describe("skipIfCtaCompleted", () => {
    it("returns null and does nothing when CTA isn't completed", async () => {
      const result = await service.skipIfCtaCompleted({ ...flowRun, ctaCompleted: false } as any);

      expect(result).toBeNull();
      expect(prisma.flowRun.update).not.toHaveBeenCalled();
    });

    it("marks Completed and returns the updated record when CTA is completed", async () => {
      const result = await service.skipIfCtaCompleted({ ...flowRun, ctaCompleted: true } as any);

      expect(prisma.flowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "run-1" },
          data: expect.objectContaining({ status: FlowRunStatus.Completed }),
        }),
      );
      expect(result?.status).toBe(FlowRunStatus.Completed);
    });
  });

  describe("scheduleRetry", () => {
    it("increments attemptCount, marks Scheduled, and enqueues a delayed retry job", async () => {
      await service.scheduleRetry(flowRun as any, config as any, "callStatus=7");

      expect(prisma.flowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "run-1" },
          data: expect.objectContaining({
            attemptCount: { increment: 1 },
            status: FlowRunStatus.Scheduled,
          }),
        }),
      );
      expect(scheduler.enqueueDelayed).toHaveBeenCalledWith("retry-flow-run", { flowRunId: "run-1" }, 600);
    });

    it("uses retryDelayMinutes over delayMinutes when set", async () => {
      await service.scheduleRetry(flowRun as any, { ...config, retryDelayMinutes: 3 } as any, "callStatus=7");

      expect(scheduler.enqueueDelayed).toHaveBeenCalledWith("retry-flow-run", { flowRunId: "run-1" }, 180);
    });
  });

  describe("resendNow", () => {
    it("increments attemptCount, resets to Received, and re-dispatches immediately", async () => {
      const result = await service.resendNow(flowRun as any, config as any);

      expect(prisma.flowRun.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "run-1" },
          data: expect.objectContaining({ attemptCount: { increment: 1 }, status: FlowRunStatus.Received }),
        }),
      );
      expect(notificationService.sendSms).toHaveBeenCalledWith("+15550001", "Hi Ana");
      expect(result.status).toBe(FlowRunStatus.Scheduled);
    });
  });

  describe("syncSchedule", () => {
    it("registers a worker and a cron schedule when sendSchedule is set", async () => {
      await service.syncSchedule({ ...config, sendSchedule: "0 10,15 * * 0-4" } as any);

      expect(scheduler.registerWorker).toHaveBeenCalledWith("dispatch-pending:kyc_reminder", expect.any(Function));
      expect(scheduler.scheduleCron).toHaveBeenCalledWith(
        "dispatch-pending:kyc_reminder",
        "0 10,15 * * 0-4",
        { flowType: "kyc_reminder" },
        "Asia/Jerusalem",
      );
    });

    it("unschedules instead when sendSchedule is cleared", async () => {
      await service.syncSchedule({ ...config, sendSchedule: null } as any);

      expect(scheduler.unschedule).toHaveBeenCalledWith("dispatch-pending:kyc_reminder");
      expect(scheduler.scheduleCron).not.toHaveBeenCalled();
    });

    it("unschedules instead when the flow is disabled, even with a sendSchedule set", async () => {
      await service.syncSchedule({ ...config, sendSchedule: "0 10 * * *", enabled: false } as any);

      expect(scheduler.unschedule).toHaveBeenCalledWith("dispatch-pending:kyc_reminder");
      expect(scheduler.scheduleCron).not.toHaveBeenCalled();
    });
  });

  describe("removeSchedule", () => {
    it("unschedules the flow's dispatch job", async () => {
      await service.removeSchedule("kyc_reminder");
      expect(scheduler.unschedule).toHaveBeenCalledWith("dispatch-pending:kyc_reminder");
    });
  });
});
