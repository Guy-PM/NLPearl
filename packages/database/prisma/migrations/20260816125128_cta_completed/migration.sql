-- AlterTable
ALTER TABLE "flow_runs" ADD COLUMN     "cta_completed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cta_completed_at" TIMESTAMP(3);
