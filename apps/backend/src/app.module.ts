import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "./prisma/prisma.module";
import { HealthModule } from "./modules/health/health.module";
import { EnrichmentModule } from "./modules/enrichment/enrichment.module";
import { NotificationModule } from "./modules/notification/notification.module";
import { NlpearlModule } from "./modules/nlpearl/nlpearl.module";
import { SchedulerModule } from "./modules/scheduler/scheduler.module";
import { FlowConfigModule } from "./modules/flow-config/flow-config.module";
import { FlowRunsModule } from "./modules/flow-runs/flow-runs.module";
import { IngestModule } from "./modules/ingest/ingest.module";
import { WebhooksModule } from "./modules/webhooks/webhooks.module";

@Module({
  imports: [
    // The root .env is loaded into process.env by dotenv-cli, from the
    // "dev"/"start" scripts in package.json — not here. `nest start --watch`
    // compiles in-memory (webpack), so a __dirname-relative envFilePath
    // isn't reliable; process.env is.
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    HealthModule,
    EnrichmentModule,
    NotificationModule,
    NlpearlModule,
    SchedulerModule,
    FlowConfigModule,
    FlowRunsModule,
    IngestModule,
    WebhooksModule,
  ],
})
export class AppModule {}
