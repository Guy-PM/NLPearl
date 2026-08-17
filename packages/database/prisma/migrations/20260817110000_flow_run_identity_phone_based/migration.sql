-- DropIndex
DROP INDEX "flow_runs_mpl_flow_type_key";

-- CreateIndex
CREATE UNIQUE INDEX "flow_runs_phone_flow_type_key" ON "flow_runs"("phone", "flow_type");
