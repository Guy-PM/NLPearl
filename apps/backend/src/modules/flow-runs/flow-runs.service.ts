import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@nlpearl/database";
import { PrismaService } from "../../prisma/prisma.service";
import { ListFlowRunsDto } from "./dto/list-flow-runs.dto";

@Injectable()
export class FlowRunsService {
  constructor(private readonly prisma: PrismaService) {}

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
      include: { events: { orderBy: { createdAt: "asc" } } },
    });
    if (!flowRun) {
      throw new NotFoundException(`FlowRun "${id}" not found`);
    }
    return flowRun;
  }

  findByNlpearlCallId(nlpearlCallId: string) {
    return this.prisma.flowRun.findFirst({ where: { nlpearlCallId } });
  }
}
