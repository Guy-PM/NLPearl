import { Module } from "@nestjs/common";
import { MessageDispatchModule } from "../message-dispatch/message-dispatch.module";
import { FlowConfigController } from "./flow-config.controller";
import { FlowConfigService } from "./flow-config.service";

@Module({
  imports: [MessageDispatchModule],
  controllers: [FlowConfigController],
  providers: [FlowConfigService],
  exports: [FlowConfigService],
})
export class FlowConfigModule {}
