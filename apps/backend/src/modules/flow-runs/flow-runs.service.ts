import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@nlpearl/database";
import { PrismaService } from "../../prisma/prisma.service";
import { FlowConfigService } from "../flow-config/flow-config.service";
import { MessageDispatchService } from "../message-dispatch/message-dispatch.service";
import { ListFlowRunsDto } from "./dto/list-flow-runs.dto";

@Injectable()
export class FlowRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly flowConfigService: FlowConfigService,
    private readonly dispatchService: MessageDispatchService,
  ) {}

  async findAll(query: ListFlowRunsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;

    const where: Prisma.FlowRunWhereInput = {
      ...(query.flowType ? { flowType: query.flowType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { mpl: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { name: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.flowRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.flowRun.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string) {
    const flowRun = await this.prisma.flowRun.findUnique({
      where: { id },
      include: {
        events: { orderBy: { createdAt: "asc" } },
        calls: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!flowRun) {
      throw new NotFoundException(`FlowRun "${id}" not found`);
    }
    return flowRun;
  }

  /** Manual "Resend" action — re-runs the full SMS+call sequence right now. */
  async resend(id: string) {
    const flowRun = await this.prisma.flowRun.findUnique({ where: { id } });
    if (!flowRun) {
      throw new NotFoundException(`FlowRun "${id}" not found`);
    }
    const config = await this.flowConfigService.findByFlowType(flowRun.flowType);
    return this.dispatchService.resendNow(flowRun, config);
  }

  /**
   * Deletes a record. Its events and call history cascade-delete with it
   * (onDelete: Cascade). Any already-queued delayed job (call trigger,
   * retry) for this id just no-ops harmlessly when it fires and finds
   * nothing — same as the existing "FlowRun not found" handling.
   */
  async remove(id: string) {
    const flowRun = await this.prisma.flowRun.findUnique({ where: { id } });
    if (!flowRun) {
      throw new NotFoundException(`FlowRun "${id}" not found`);
    }
    await this.prisma.flowRun.delete({ where: { id } });
    return { id, deleted: true };
  }
}
