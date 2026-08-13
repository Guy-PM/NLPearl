import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import PgBoss from "pg-boss";

/**
 * Thin wrapper around pg-boss — a Postgres-backed job queue. Chosen over
 * RabbitMQ/BullMQ+Redis so the X-minute delayed "trigger the NLPearl
 * call" job doesn't require standing up extra infra beyond the Postgres
 * we already have, and because we only have this one job type.
 */
@Injectable()
export class SchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SchedulerService.name);
  private boss!: PgBoss;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit() {
    this.boss = new PgBoss(this.config.getOrThrow<string>("DATABASE_URL"));
    this.boss.on("error", (error) => this.logger.error(error));
    await this.boss.start();
  }

  async onModuleDestroy() {
    await this.boss.stop({ graceful: true });
  }

  /** Schedules `jobName` to run once, `delaySeconds` from now. */
  async enqueueDelayed<T extends object>(
    jobName: string,
    data: T,
    delaySeconds: number,
  ): Promise<string | null> {
    return this.boss.send(jobName, data, { startAfter: delaySeconds });
  }

  /** Registers a handler for `jobName`. Call once per job type at startup. */
  async registerWorker<T extends object>(
    jobName: string,
    handler: (data: T) => Promise<void>,
  ): Promise<void> {
    await this.boss.work<T>(jobName, async ([job]) => {
      await handler(job.data);
    });
  }
}
