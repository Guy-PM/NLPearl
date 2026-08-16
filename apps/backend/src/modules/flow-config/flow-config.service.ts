import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { MessageDispatchService } from "../message-dispatch/message-dispatch.service";
import { CreateFlowConfigDto, UpdateFlowConfigDto } from "./dto/flow-config.dto";

@Injectable()
export class FlowConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatchService: MessageDispatchService,
  ) {}

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

  async create(dto: CreateFlowConfigDto) {
    const config = await this.prisma.flowConfig.create({ data: normalizeEmptyStrings(dto) });
    await this.dispatchService.syncSchedule(config);
    return config;
  }

  async update(flowType: string, dto: UpdateFlowConfigDto) {
    await this.findByFlowType(flowType);
    const config = await this.prisma.flowConfig.update({
      where: { flowType },
      data: normalizeEmptyStrings(dto),
    });
    await this.dispatchService.syncSchedule(config);
    return config;
  }

  async remove(flowType: string) {
    await this.findByFlowType(flowType);
    await this.prisma.flowConfig.delete({ where: { flowType } });
    await this.dispatchService.removeSchedule(flowType);
  }
}

/**
 * An empty string on any of these nullable fields means "clear it" (e.g.
 * `sendSchedule: ""` reverts to sending immediately; `retryOnCallStatuses:
 * ""` clears that retry condition).
 */
function normalizeEmptyStrings<
  T extends {
    sendSchedule?: string;
    retryOnCallStatuses?: string;
    retryOnConversationStatuses?: string;
  },
>(dto: T): T {
  const result = { ...dto };
  for (const key of ["sendSchedule", "retryOnCallStatuses", "retryOnConversationStatuses"] as const) {
    if (result[key] === "") {
      (result as any)[key] = null;
    }
  }
  return result;
}
