-- DropIndex
DROP INDEX "flow_runs_mpl_idx";

-- DropIndex
DROP INDEX "flow_runs_request_id_key";

-- AlterTable
ALTER TABLE "flow_runs" DROP COLUMN "call_status",
DROP COLUMN "collected_info",
DROP COLUMN "conversation_status",
DROP COLUMN "duration",
DROP COLUMN "nlpearl_call_id",
DROP COLUMN "nlpearl_call_request_id",
DROP COLUMN "recording_url",
DROP COLUMN "summary";

-- CreateTable
CREATE TABLE "nlpearl_calls" (
    "id" UUID NOT NULL,
    "flow_run_id" UUID NOT NULL,
    "nlpearl_call_request_id" TEXT,
    "nlpearl_call_id" TEXT,
    "call_status" TEXT,
    "conversation_status" TEXT,
    "duration" INTEGER,
    "summary" TEXT,
    "recording_url" TEXT,
    "collected_info" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nlpearl_calls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nlpearl_calls_flow_run_id_idx" ON "nlpearl_calls"("flow_run_id");

-- CreateIndex
CREATE INDEX "nlpearl_calls_nlpearl_call_id_idx" ON "nlpearl_calls"("nlpearl_call_id");

-- CreateIndex
CREATE UNIQUE INDEX "flow_runs_mpl_flow_type_key" ON "flow_runs"("mpl", "flow_type");

-- AddForeignKey
ALTER TABLE "nlpearl_calls" ADD CONSTRAINT "nlpearl_calls_flow_run_id_fkey" FOREIGN KEY ("flow_run_id") REFERENCES "flow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
