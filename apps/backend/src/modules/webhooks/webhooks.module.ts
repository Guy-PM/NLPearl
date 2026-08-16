import { Module } from "@nestjs/common";
import { FlowConfigModule } from "../flow-config/flow-config.module";
import { FlowRunsModule } from "../flow-runs/flow-runs.module";
import { MessageDispatchModule } from "../message-dispatch/message-dispatch.module";
import { NlpearlModule } from "../nlpearl/nlpearl.module";
import { NotificationModule } from "../notification/notification.module";
import { WebhooksController } from "./webhooks.controller";
import { WebhooksService } from "./webhooks.service";

@Module({
  imports: [FlowConfigModule, FlowRunsModule, MessageDispatchModule, NlpearlModule, NotificationModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
