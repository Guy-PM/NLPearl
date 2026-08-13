import { Controller, Get, Param, Query } from "@nestjs/common";
import { FlowRunsService } from "./flow-runs.service";
import { ListFlowRunsDto } from "./dto/list-flow-runs.dto";

@Controller("flow-runs")
export class FlowRunsController {
  constructor(private readonly flowRunsService: FlowRunsService) {}

  @Get()
  findAll(@Query() query: ListFlowRunsDto) {
    return this.flowRunsService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.flowRunsService.findOne(id);
  }
}
