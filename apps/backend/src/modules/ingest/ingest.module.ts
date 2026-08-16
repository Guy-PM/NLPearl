import { Module } from "@nestjs/common";
import { EnrichmentModule } from "../enrichment/enrichment.module";
import { FlowConfigModule } from "../flow-config/flow-config.module";
import { FlowRunsModule } from "../flow-runs/flow-runs.module";
import { MessageDispatchModule } from "../message-dispatch/message-dispatch.module";
import { NlpearlModule } from "../nlpearl/nlpearl.module";
import { SchedulerModule } from "../scheduler/scheduler.module";
import { CallTriggerWorker } from "./call-trigger.worker";
import { IngestController } from "./ingest.controller";
import { IngestService } from "./ingest.service";

@Module({
  imports: [
    EnrichmentModule,
    FlowConfigModule,
    FlowRunsModule,
    MessageDispatchModule,
    NlpearlModule,
    SchedulerModule,
  ],
  controllers: [IngestController],
  providers: [IngestService, CallTriggerWorker],
})
export class IngestModule {}
