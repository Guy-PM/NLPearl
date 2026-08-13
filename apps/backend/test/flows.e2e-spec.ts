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
  let schedulerService: { enqueueDelayed: jest.Mock; registerWorker: jest.Mock };
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
    expect(res.body.summary).toBe("Client agreed to complete KYC.");
    expect(res.body.duration).toBe(58);
    expect(res.body.recordingUrl).toBe("https://recording.example/call-xyz");
    expect(res.body.events.length).toBeGreaterThanOrEqual(5);
  });

  it("is idempotent on a repeated N8N delivery with the same requestId", async () => {
    const dupPayload = { ...payload, requestId: "fixed-request-id" };
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
});
