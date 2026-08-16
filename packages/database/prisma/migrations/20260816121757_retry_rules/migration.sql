-- AlterTable
ALTER TABLE "flow_configs" ADD COLUMN     "max_retry_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "retry_delay_minutes" INTEGER,
ADD COLUMN     "retry_min_call_duration_seconds" INTEGER,
ADD COLUMN     "retry_on_call_statuses" TEXT,
ADD COLUMN     "retry_on_conversation_statuses" TEXT;

-- AlterTable
ALTER TABLE "flow_runs" ADD COLUMN     "attempt_count" INTEGER NOT NULL DEFAULT 1;
