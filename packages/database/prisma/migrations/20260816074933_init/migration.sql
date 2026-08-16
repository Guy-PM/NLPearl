-- CreateEnum
CREATE TYPE "FlowRunStatus" AS ENUM ('Received', 'PreSmsSent', 'Scheduled', 'CallTriggered', 'ConsentGiven', 'CallEnded', 'Completed', 'Failed');

-- CreateTable
CREATE TABLE "flow_configs" (
    "id" UUID NOT NULL,
    "flow_type" TEXT NOT NULL,
    "nlpearl_outbound_id" TEXT NOT NULL,
    "preliminary_sms_template" TEXT NOT NULL,
    "consent_sms_template" TEXT NOT NULL,
    "delay_minutes" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_runs" (
    "id" UUID NOT NULL,
    "request_id" TEXT NOT NULL,
    "flow_type" TEXT NOT NULL,
    "mpl" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cfa_url" TEXT,
    "raw_payload" JSONB NOT NULL,
    "status" "FlowRunStatus" NOT NULL DEFAULT 'Received',
    "nlpearl_call_request_id" TEXT,
    "nlpearl_call_id" TEXT,
    "call_status" TEXT,
    "conversation_status" TEXT,
    "duration" INTEGER,
    "summary" TEXT,
    "recording_url" TEXT,
    "collected_info" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "flow_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flow_run_events" (
    "id" UUID NOT NULL,
    "flow_run_id" UUID NOT NULL,
    "status" "FlowRunStatus" NOT NULL,
    "detail" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flow_run_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "flow_configs_flow_type_key" ON "flow_configs"("flow_type");

-- CreateIndex
CREATE UNIQUE INDEX "flow_runs_request_id_key" ON "flow_runs"("request_id");

-- CreateIndex
CREATE INDEX "flow_runs_flow_type_idx" ON "flow_runs"("flow_type");

-- CreateIndex
CREATE INDEX "flow_runs_status_idx" ON "flow_runs"("status");

-- CreateIndex
CREATE INDEX "flow_runs_mpl_idx" ON "flow_runs"("mpl");

-- CreateIndex
CREATE INDEX "flow_run_events_flow_run_id_idx" ON "flow_run_events"("flow_run_id");

-- AddForeignKey
ALTER TABLE "flow_run_events" ADD CONSTRAINT "flow_run_events_flow_run_id_fkey" FOREIGN KEY ("flow_run_id") REFERENCES "flow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
