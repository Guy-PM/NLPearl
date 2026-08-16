-- AlterTable
ALTER TABLE "flow_configs" ADD COLUMN     "send_schedule" TEXT,
ADD COLUMN     "send_timezone" TEXT NOT NULL DEFAULT 'Asia/Jerusalem';
