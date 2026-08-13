import { randomUUID } from "crypto";

/**
 * Minimal in-memory stand-in for PrismaService, covering exactly the
 * query shapes IngestService/CallTriggerWorker/WebhooksService/
 * FlowRunsService/FlowConfigService issue. Not a general Prisma
 * reimplementation — just enough to smoke-test the pipeline without a
 * real Postgres instance.
 */
export function createFakePrisma() {
  const flowConfigs = new Map<string, any>();
  const flowRuns = new Map<string, any>();

  function matches(record: any, where: Record<string, any> = {}): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (condition && typeof condition === "object" && "in" in condition) {
        return (condition.in as unknown[]).includes(record[key]);
      }
      return record[key] === condition;
    });
  }

  return {
    flowConfig: {
      findUnique: async ({ where }: any) => flowConfigs.get(where.flowType) ?? null,
      findMany: async () => [...flowConfigs.values()],
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), enabled: true, ...data };
        flowConfigs.set(record.flowType, record);
        return record;
      },
      __seed: (record: any) => flowConfigs.set(record.flowType, { id: randomUUID(), ...record }),
    },
    flowRun: {
      findUnique: async ({ where }: any) => {
        if (where.id) return flowRuns.get(where.id) ?? null;
        if (where.requestId) {
          return [...flowRuns.values()].find((r) => r.requestId === where.requestId) ?? null;
        }
        return null;
      },
      findFirst: async ({ where, orderBy }: any) => {
        const candidates = [...flowRuns.values()].filter((r) => matches(r, where));
        if (orderBy?.createdAt === "desc") {
          candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        return candidates[0] ?? null;
      },
      findMany: async ({ where }: any = {}) => [...flowRuns.values()].filter((r) => matches(r, where)),
      count: async ({ where }: any = {}) => [...flowRuns.values()].filter((r) => matches(r, where)).length,
      create: async ({ data }: any) => {
        const { events, ...rest } = data;
        const now = new Date().toISOString();
        const record = {
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          events: events?.create ? [{ id: randomUUID(), createdAt: now, ...events.create }] : [],
          ...rest,
        };
        flowRuns.set(record.id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = flowRuns.get(where.id);
        if (!existing) throw new Error(`FlowRun ${where.id} not found`);
        const { events, ...rest } = data;
        const updated = {
          ...existing,
          ...rest,
          updatedAt: new Date().toISOString(),
          events: events?.create
            ? [...existing.events, { id: randomUUID(), createdAt: new Date().toISOString(), ...events.create }]
            : existing.events,
        };
        flowRuns.set(where.id, updated);
        return updated;
      },
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
    $queryRaw: async () => 1,
  };
}
