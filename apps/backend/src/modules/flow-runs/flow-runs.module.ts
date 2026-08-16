import { Module } from "@nestjs/common";
import { FlowConfigModule } from "../flow-config/flow-config.module";
import { MessageDispatchModule } from "../message-dispatch/message-dispatch.module";
import { FlowRunsController } from "./flow-runs.controller";
import { FlowRunsService } from "./flow-runs.service";
import { FlowRunTransitionService } from "./flow-run-transition.service";

@Module({
  imports: [FlowConfigModule, MessageDispatchModule],
  controllers: [FlowRunsController],
  providers: [FlowRunsService, FlowRunTransitionService],
  exports: [FlowRunsService, FlowRunTransitionService],
})
export class FlowRunsModule {}
