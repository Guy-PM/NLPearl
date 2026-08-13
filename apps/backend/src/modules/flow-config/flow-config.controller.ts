import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { FlowConfigService } from "./flow-config.service";
import { CreateFlowConfigDto, UpdateFlowConfigDto } from "./dto/flow-config.dto";

@Controller("flow-configs")
export class FlowConfigController {
  constructor(private readonly flowConfigService: FlowConfigService) {}

  @Get()
  findAll() {
    return this.flowConfigService.findAll();
  }

  @Get(":flowType")
  findOne(@Param("flowType") flowType: string) {
    return this.flowConfigService.findByFlowType(flowType);
  }

  @Post()
  create(@Body() dto: CreateFlowConfigDto) {
    return this.flowConfigService.create(dto);
  }

  @Patch(":flowType")
  update(@Param("flowType") flowType: string, @Body() dto: UpdateFlowConfigDto) {
    return this.flowConfigService.update(flowType, dto);
  }

  @Delete(":flowType")
  remove(@Param("flowType") flowType: string) {
    return this.flowConfigService.remove(flowType);
  }
}
