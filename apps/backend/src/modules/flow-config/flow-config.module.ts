import { Module } from "@nestjs/common";
import { FlowConfigController } from "./flow-config.controller";
import { FlowConfigService } from "./flow-config.service";

@Module({
  controllers: [FlowConfigController],
  providers: [FlowConfigService],
  exports: [FlowConfigService],
})
export class FlowConfigModule {}
