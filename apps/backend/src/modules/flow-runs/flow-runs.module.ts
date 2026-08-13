import { Module } from "@nestjs/common";
import { FlowRunsController } from "./flow-runs.controller";
import { FlowRunsService } from "./flow-runs.service";
import { FlowRunTransitionService } from "./flow-run-transition.service";

@Module({
  controllers: [FlowRunsController],
  providers: [FlowRunsService, FlowRunTransitionService],
  exports: [FlowRunsService, FlowRunTransitionService],
})
export class FlowRunsModule {}
