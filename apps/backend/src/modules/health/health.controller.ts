import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok", db: "ok" };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: "error",
        db: "unreachable",
        error: { details: (error as Error).message },
      });
    }
  }
}
