import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import PgBoss from "pg-boss";

/**
 * Thin wrapper around pg-boss — a Postgres-backed job queue. Chosen over
 * RabbitMQ/BullMQ+Redis so the X-minute delayed "trigger the NLPearl
 * call" job (and the per-flow cron dispatch schedules) don't require
 * standing up extra infra beyond the Postgres we already have.
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

  /**
   * pg-boss (v10) never auto-creates a queue on `send()`/`work()`/
   * `schedule()` — each silently no-ops (no error, no job, nothing) against
   * a queue that doesn't exist yet. Every method below must ensure the
   * queue exists first. `createQueue` is safe to call repeatedly.
   */
  private async ensureQueue(jobName: string): Promise<void> {
    await this.boss.createQueue(jobName).catch(() => undefined);
  }

  /** Schedules `jobName` to run once, `delaySeconds` from now. */
  async enqueueDelayed<T extends object>(
    jobName: string,
    data: T,
    delaySeconds: number,
  ): Promise<string | null> {
    await this.ensureQueue(jobName);
    return this.boss.send(jobName, data, { startAfter: delaySeconds });
  }

  /** Registers a handler for `jobName`. Call once per job type at startup. */
  async registerWorker<T extends object>(
    jobName: string,
    handler: (data: T) => Promise<void>,
  ): Promise<void> {
    await this.ensureQueue(jobName);
    await this.boss.work<T>(jobName, async ([job]) => {
      await handler(job.data);
    });
  }

  /**
   * Registers/updates a recurring cron schedule for `jobName` — re-calling
   * with a new `cron`/`data` for the same name updates it in place (pg-boss
   * keys schedules by name). A worker must also be registered for `jobName`
   * via `registerWorker`, or scheduled jobs will just queue up unprocessed.
   */
  async scheduleCron(jobName: string, cron: string, data: object, timezone: string): Promise<void> {
    await this.ensureQueue(jobName);
    await this.boss.schedule(jobName, cron, data, { tz: timezone });
  }

  /** Removes a cron schedule previously set with `scheduleCron`. No-op if none exists. */
  async unschedule(jobName: string): Promise<void> {
    await this.boss.unschedule(jobName);
  }
}
