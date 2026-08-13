import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { CreateFlowConfigDto, UpdateFlowConfigDto } from "./dto/flow-config.dto";

@Injectable()
export class FlowConfigService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.flowConfig.findMany({ orderBy: { flowType: "asc" } });
  }

  async findByFlowType(flowType: string) {
    const config = await this.prisma.flowConfig.findUnique({ where: { flowType } });
    if (!config) {
      throw new NotFoundException(`No FlowConfig for flowType "${flowType}"`);
    }
    return config;
  }

  create(dto: CreateFlowConfigDto) {
    return this.prisma.flowConfig.create({ data: dto });
  }

  async update(flowType: string, dto: UpdateFlowConfigDto) {
    await this.findByFlowType(flowType);
    return this.prisma.flowConfig.update({ where: { flowType }, data: dto });
  }

  async remove(flowType: string) {
    await this.findByFlowType(flowType);
    await this.prisma.flowConfig.delete({ where: { flowType } });
  }
}
