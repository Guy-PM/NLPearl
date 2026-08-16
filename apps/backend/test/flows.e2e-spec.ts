import { INestApplication, ValidationPipe } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { PrismaModule } from "../src/prisma/prisma.module";
import { PrismaService } from "../src/prisma/prisma.service";
import { IngestModule } from "../src/modules/ingest/ingest.module";
import { WebhooksModule } from "../src/modules/webhooks/webhooks.module";
import { FlowRunsModule } from "../src/modules/flow-runs/flow-runs.module";
import { NotificationService } from "../src/modules/notification/notification.service";
import { NlpearlService } from "../src/modules/nlpearl/nlpearl.service";
import { SchedulerService } from "../src/modules/scheduler/scheduler.service";
import { createFakePrisma } from "./fakes/fake-prisma";

/**
 * Full-pipeline smoke test: N8N flow-trigger -> preliminary SMS -> (delayed
 * job, fired manually here instead of waiting real minutes) -> NLPearl call
 * trigger -> consent webhook -> call-ended webhook -> Completed. Everything
 * external (Prisma, PayMe Notification Gateway, NLPearl API, pg-boss) is
 * stubbed — this proves the modules wire together correctly, not that the
 * real integrations behave as documented.
 */
describe("Flow pipeline (e2e, stubbed)", () => {
  let app: INestApplication;
  let fakePrisma: ReturnType<typeof createFakePrisma>;
  let notificationService: { sendSms: jest.Mock };
  let nlpearlService: { makeCall: jest.Mock; getCall: jest.Mock };
  let schedulerService: {
    enqueueDelayed: jest.Mock;
    registerWorker: jest.Mock;
    scheduleCron: jest.Mock;
    unschedule: jest.Mock;
  };
  let registeredJobHandlers: Record<string, (data: any) => Promise<void>>;

  const FLOW_CONFIG = {
    flowType: "kyc_reminder",
    nlpearlOutboundId: "outbound-1",
    preliminarySmsTemplate: "Hi {{name}}, expect a call soon.",
    consentSmsTemplate: "Here is your link: {{cfaUrl}}",
    delayMinutes: 10,
    enabled: true,
  };

  beforeAll(async () => {
    process.env.N8N_WEBHOOK_API_KEY = "n8n-secret";
    process.env.NLPEARL_WEBHOOK_API_KEY = "nlpearl-secret";

    fakePrisma = createFakePrisma();
    (fakePrisma.flowConfig as any).__seed(FLOW_CONFIG);

    registeredJobHandlers = {};
    notificationService = { sendSms: jest.fn().mockResolvedValue(undefined) };
    nlpearlService = {
      makeCall: jest.fn().mockResolvedValue({ id: "call-request-1" }),
      getCall: jest.fn().mockResolvedValue({
        id: "call-xyz",
        status: 4,
        conversationStatus: 100,
        duration: 58,
        summary: "Client agreed to complete KYC.",
        recording: "https://recording.example/call-xyz",
        collectedInfo: { agreed: true },
      }),
    };
    schedulerService = {
      enqueueDelayed: jest.fn().mockResolvedValue("job-1"),
      registerWorker: jest.fn().mockImplementation((jobName, handler) => {
        registeredJobHandlers[jobName] = handler;
        return Promise.resolve();
      }),
      scheduleCron: jest.fn().mockResolvedValue(undefined),
      unschedule: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule, IngestModule, WebhooksModule, FlowRunsModule],
    })
      .overrideProvider(PrismaService)
      .useValue(fakePrisma)
      .overrideProvider(NotificationService)
      .useValue(notificationService)
      .overrideProvider(NlpearlService)
      .useValue(nlpearlService)
      .overrideProvider(SchedulerService)
      .useValue(schedulerService)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.setGlobalPrefix("api");
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const payload = {
    flowType: "kyc_reminder",
    name: "Ana",
    phone: "+15550001",
    mpl: "mpl-1",
    cfaUrl: "https://cfa.example/1",
  };

  let flowRunId: string;

  it("rejects the N8N webhook without the shared secret", async () => {
    await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .send(payload)
      .expect(401);
  });

  it("ingests a flow-trigger: creates the FlowRun and sends the preliminary SMS", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send(payload)
      .expect(201);

    flowRunId = res.body.id;
    expect(res.body.status).toBe("Scheduled");
    expect(notificationService.sendSms).toHaveBeenCalledWith(
      "+15550001",
      "Hi Ana, expect a call soon.",
    );
    expect(schedulerService.enqueueDelayed).toHaveBeenCalledWith(
      "trigger-nlpearl-call",
      { flowRunId },
      600,
    );
  });

  it("fires the delayed job and triggers the NLPearl call", async () => {
    await registeredJobHandlers["trigger-nlpearl-call"]({ flowRunId });

    expect(nlpearlService.makeCall).toHaveBeenCalledWith("outbound-1", {
      to: "+15550001",
      callData: { name: "Ana", mpl: "mpl-1", cfaUrl: "https://cfa.example/1", flowType: "kyc_reminder" },
    });

    const res = await request(app.getHttpServer()).get(`/api/flow-runs/${flowRunId}`).expect(200);
    expect(res.body.status).toBe("CallTriggered");
  });

  it("handles the in-call consent webhook and sends the CTA SMS", async () => {
    await request(app.getHttpServer())
      .post("/api/webhooks/nlpearl/consent")
      .set("x-api-key", "nlpearl-secret")
      .send({ mpl: "mpl-1", phone: "+15550001", flowType: "kyc_reminder" })
      .expect(200);

    expect(notificationService.sendSms).toHaveBeenCalledWith(
      "+15550001",
      "Here is your link: https://cfa.example/1",
    );

    const res = await request(app.getHttpServer()).get(`/api/flow-runs/${flowRunId}`).expect(200);
    expect(res.body.status).toBe("ConsentGiven");
  });

  it("handles the call-ended webhook, fetches call details, and completes the FlowRun", async () => {
    await request(app.getHttpServer())
      .post("/api/webhooks/nlpearl/call-ended")
      .set("x-api-key", "nlpearl-secret")
      .send({ id: "call-xyz", to: "+15550001", status: "Completed" })
      .expect(200);

    expect(nlpearlService.getCall).toHaveBeenCalledWith("call-xyz");

    const res = await request(app.getHttpServer()).get(`/api/flow-runs/${flowRunId}`).expect(200);
    expect(res.body.status).toBe("Completed");
    expect(res.body.calls).toHaveLength(1);
    expect(res.body.calls[0].summary).toBe("Client agreed to complete KYC.");
    expect(res.body.calls[0].duration).toBe(58);
    expect(res.body.calls[0].recordingUrl).toBe("https://recording.example/call-xyz");
    expect(res.body.events.length).toBeGreaterThanOrEqual(5);
  });

  it("treats a second real attempt for the same client as an update to the same row, not a new one", async () => {
    const retryPayload = { ...payload, requestId: "attempt-2" };

    const res = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send(retryPayload)
      .expect(201);

    expect(res.body.id).toBe(flowRunId);
    expect(res.body.status).toBe("Scheduled");
    expect(notificationService.sendSms).toHaveBeenCalledWith(
      "+15550001",
      "Hi Ana, expect a call soon.",
    );

    const list = await request(app.getHttpServer())
      .get(`/api/flow-runs?flowType=kyc_reminder&search=mpl-1`)
      .expect(200);
    expect(list.body.total).toBe(1);

    const detail = await request(app.getHttpServer()).get(`/api/flow-runs/${flowRunId}`).expect(200);
    // Prior attempt's call history is preserved, not wiped.
    expect(detail.body.calls).toHaveLength(1);
  });

  it("is idempotent on a repeated N8N delivery with the same requestId", async () => {
    const dupPayload = { ...payload, mpl: "mpl-2", requestId: "fixed-request-id" };
    const first = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send(dupPayload)
      .expect(201);

    const callCountBefore = notificationService.sendSms.mock.calls.length;

    const second = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send(dupPayload)
      .expect(201);

    expect(second.body.id).toBe(first.body.id);
    expect(notificationService.sendSms.mock.calls.length).toBe(callCountBefore);
  });

  it("holds a batched flow's records at Received until its cron job fires", async () => {
    await request(app.getHttpServer())
      .post("/api/flow-configs")
      .send({
        flowType: "batched_flow",
        nlpearlOutboundId: "outbound-batched",
        preliminarySmsTemplate: "Hi {{name}}, batched send.",
        consentSmsTemplate: "Link: {{cfaUrl}}",
        delayMinutes: 5,
        sendSchedule: "0 10,15 * * 0-4",
      })
      .expect(201);

    expect(schedulerService.registerWorker).toHaveBeenCalledWith(
      "dispatch-pending:batched_flow",
      expect.any(Function),
    );
    expect(schedulerService.scheduleCron).toHaveBeenCalledWith(
      "dispatch-pending:batched_flow",
      "0 10,15 * * 0-4",
      { flowType: "batched_flow" },
      "Asia/Jerusalem",
    );

    const ingestRes = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send({ flowType: "batched_flow", name: "Cara", phone: "+15550003", mpl: "mpl-3" })
      .expect(201);

    expect(ingestRes.body.status).toBe("Received");
    const countBefore = notificationService.sendSms.mock.calls.length;

    // Simulate the cron firing.
    await registeredJobHandlers["dispatch-pending:batched_flow"]({ flowType: "batched_flow" });

    expect(notificationService.sendSms.mock.calls.length).toBe(countBefore + 1);
    expect(notificationService.sendSms).toHaveBeenCalledWith("+15550003", "Hi Cara, batched send.");

    const detail = await request(app.getHttpServer())
      .get(`/api/flow-runs/${ingestRes.body.id}`)
      .expect(200);
    expect(detail.body.status).toBe("Scheduled");
  });

  it("auto-retries when a call ends with a status matching the flow's retry rules", async () => {
    await request(app.getHttpServer())
      .post("/api/flow-configs")
      .send({
        flowType: "retry_flow",
        nlpearlOutboundId: "outbound-retry",
        preliminarySmsTemplate: "Hi {{name}}, retry flow.",
        consentSmsTemplate: "Link: {{cfaUrl}}",
        delayMinutes: 5,
        maxRetryAttempts: 1,
        retryDelayMinutes: 3,
        retryOnCallStatuses: "5",
      })
      .expect(201);

    const ingestRes = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send({ flowType: "retry_flow", name: "Dov", phone: "+15550004", mpl: "mpl-4" })
      .expect(201);
    const retryFlowRunId = ingestRes.body.id;

    await registeredJobHandlers["trigger-nlpearl-call"]({ flowRunId: retryFlowRunId });

    nlpearlService.getCall.mockResolvedValueOnce({
      id: "call-busy-1",
      status: 5,
      conversationStatus: 10,
      duration: 0,
      summary: null,
      recording: null,
      collectedInfo: null,
    });
    const sendCountBefore = notificationService.sendSms.mock.calls.length;

    await request(app.getHttpServer())
      .post("/api/webhooks/nlpearl/call-ended")
      .set("x-api-key", "nlpearl-secret")
      .send({ id: "call-busy-1", to: "+15550004", status: "Busy" })
      .expect(200);

    const afterCallEnded = await request(app.getHttpServer())
      .get(`/api/flow-runs/${retryFlowRunId}`)
      .expect(200);
    expect(afterCallEnded.body.status).toBe("Scheduled");
    expect(schedulerService.enqueueDelayed).toHaveBeenCalledWith(
      "retry-flow-run",
      { flowRunId: retryFlowRunId },
      180,
    );

    // Simulate the retry job firing: full sequence re-runs (SMS resent).
    await registeredJobHandlers["retry-flow-run"]({ flowRunId: retryFlowRunId });

    expect(notificationService.sendSms.mock.calls.length).toBe(sendCountBefore + 1);
    expect(notificationService.sendSms).toHaveBeenLastCalledWith("+15550004", "Hi Dov, retry flow.");
  });

  it("resends immediately via the manual endpoint, bypassing the retry cap", async () => {
    const ingestRes = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send({ flowType: "kyc_reminder", name: "Eli", phone: "+15550005", mpl: "mpl-5" })
      .expect(201);

    const sendCountBefore = notificationService.sendSms.mock.calls.length;

    const resendRes = await request(app.getHttpServer())
      .post(`/api/flow-runs/${ingestRes.body.id}/resend`)
      .expect(201);

    expect(resendRes.body.status).toBe("Scheduled");
    expect(notificationService.sendSms.mock.calls.length).toBe(sendCountBefore + 1);
    expect(notificationService.sendSms).toHaveBeenLastCalledWith("+15550005", "Hi Eli, expect a call soon.");
  });

  it("marks CTA completed via the N8N webhook, correlating by phone+flow", async () => {
    const ingestRes = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send({ flowType: "kyc_reminder", name: "Fay", phone: "+15550006", mpl: "mpl-6" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/webhooks/n8n/cta-complete")
      .set("x-api-key", "n8n-secret")
      .send({ phone: "+15550006", flow: "kyc_reminder", cta_complete: true })
      .expect(200);

    const detail = await request(app.getHttpServer())
      .get(`/api/flow-runs/${ingestRes.body.id}`)
      .expect(200);
    expect(detail.body.ctaCompleted).toBe(true);
    expect(detail.body.ctaCompletedAt).not.toBeNull();
  });

  it("rejects the cta-complete webhook without the shared secret", async () => {
    await request(app.getHttpServer())
      .post("/api/webhooks/n8n/cta-complete")
      .send({ phone: "+15550006", flow: "kyc_reminder", cta_complete: true })
      .expect(401);
  });

  it("skips the NLPearl call entirely when CTA completes before the delayed job fires", async () => {
    const ingestRes = await request(app.getHttpServer())
      .post("/api/webhooks/n8n/flow-trigger")
      .set("x-api-key", "n8n-secret")
      .send({ flowType: "kyc_reminder", name: "Gil", phone: "+15550007", mpl: "mpl-7" })
      .expect(201);

    await request(app.getHttpServer())
      .post("/api/webhooks/n8n/cta-complete")
      .set("x-api-key", "n8n-secret")
      .send({ phone: "+15550007", flow: "kyc_reminder", cta_complete: true })
      .expect(200);

    const callCountBefore = nlpearlService.makeCall.mock.calls.length;
    await registeredJobHandlers["trigger-nlpearl-call"]({ flowRunId: ingestRes.body.id });

    expect(nlpearlService.makeCall.mock.calls.length).toBe(callCountBefore);

    const detail = await request(app.getHttpServer())
      .get(`/api/flow-runs/${ingestRes.body.id}`)
      .expect(200);
    expect(detail.body.status).toBe("Completed");
  });
});
