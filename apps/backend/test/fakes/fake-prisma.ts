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
  const nlpearlCalls = new Map<string, any>();

  function matches(record: any, where: Record<string, any> = {}): boolean {
    return Object.entries(where).every(([key, condition]) => {
      if (key === "OR") {
        return (condition as Record<string, any>[]).some((sub) => matches(record, sub));
      }
      if (condition && typeof condition === "object" && "in" in condition) {
        return (condition.in as unknown[]).includes(record[key]);
      }
      if (condition && typeof condition === "object" && "contains" in condition) {
        return String(record[key] ?? "")
          .toLowerCase()
          .includes(String(condition.contains).toLowerCase());
      }
      return record[key] === condition;
    });
  }

  // Real Prisma omits `undefined`-valued fields from the SQL write entirely
  // (letting column defaults apply); a naive `{...defaults, ...data}` spread
  // doesn't — an explicit `undefined` (e.g. from an omitted optional DTO
  // field materialized by class-transformer) would override the default.
  function stripUndefined(obj: object): any {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
  }

  // Real Prisma supports atomic `{ increment: N }` update expressions;
  // resolve them against the existing record's value before merging.
  function resolveIncrements(existing: any, data: object): any {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => {
        if (value && typeof value === "object" && "increment" in (value as any)) {
          return [key, (existing[key] ?? 0) + (value as any).increment];
        }
        return [key, value];
      }),
    );
  }

  function callsForFlowRun(flowRunId: string) {
    return [...nlpearlCalls.values()]
      .filter((c) => c.flowRunId === flowRunId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  return {
    flowConfig: {
      findUnique: async ({ where }: any) => flowConfigs.get(where.flowType) ?? null,
      findMany: async ({ where }: any = {}) => [...flowConfigs.values()].filter((r) => matches(r, where)),
      create: async ({ data }: any) => {
        const record = { id: randomUUID(), enabled: true, sendTimezone: "Asia/Jerusalem", ...stripUndefined(data) };
        flowConfigs.set(record.flowType, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = flowConfigs.get(where.flowType);
        if (!existing) throw new Error(`FlowConfig ${where.flowType} not found`);
        const updated = { ...existing, ...stripUndefined(data) };
        flowConfigs.set(where.flowType, updated);
        return updated;
      },
      __seed: (record: any) =>
        flowConfigs.set(record.flowType, { id: randomUUID(), sendTimezone: "Asia/Jerusalem", ...record }),
    },
    flowRun: {
      findUnique: async ({ where, include }: any) => {
        let record: any = null;
        if (where.id) record = flowRuns.get(where.id) ?? null;
        else if (where.requestId) {
          record = [...flowRuns.values()].find((r) => r.requestId === where.requestId) ?? null;
        } else if (where.mpl_flowType) {
          record =
            [...flowRuns.values()].find(
              (r) => r.mpl === where.mpl_flowType.mpl && r.flowType === where.mpl_flowType.flowType,
            ) ?? null;
        }
        if (record && include?.calls) record = { ...record, calls: callsForFlowRun(record.id) };
        return record;
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
        const { events, calls, ...rest } = data;
        const now = new Date().toISOString();
        const record = {
          id: randomUUID(),
          createdAt: now,
          updatedAt: now,
          events: events?.create ? [{ id: randomUUID(), createdAt: now, ...events.create }] : [],
          ...stripUndefined(rest),
        };
        flowRuns.set(record.id, record);
        if (calls?.create) {
          const callRecord = {
            id: randomUUID(),
            flowRunId: record.id,
            nlpearlCallId: null,
            createdAt: now,
            updatedAt: now,
            ...calls.create,
          };
          nlpearlCalls.set(callRecord.id, callRecord);
        }
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = flowRuns.get(where.id);
        if (!existing) throw new Error(`FlowRun ${where.id} not found`);
        const { events, calls, ...rest } = data;
        const now = new Date().toISOString();
        const updated = {
          ...existing,
          ...stripUndefined(resolveIncrements(existing, rest)),
          updatedAt: now,
          events: events?.create
            ? [...existing.events, { id: randomUUID(), createdAt: now, ...events.create }]
            : existing.events,
        };
        flowRuns.set(where.id, updated);
        if (calls?.create) {
          const callRecord = {
            id: randomUUID(),
            flowRunId: where.id,
            nlpearlCallId: null,
            createdAt: now,
            updatedAt: now,
            ...calls.create,
          };
          nlpearlCalls.set(callRecord.id, callRecord);
        }
        return updated;
      },
      delete: async ({ where }: any) => {
        const existing = flowRuns.get(where.id);
        if (!existing) throw new Error(`FlowRun ${where.id} not found`);
        flowRuns.delete(where.id);
        for (const call of callsForFlowRun(where.id)) nlpearlCalls.delete(call.id);
        return existing;
      },
    },
    nlpearlCall: {
      findFirst: async ({ where, orderBy }: any) => {
        const candidates = [...nlpearlCalls.values()].filter((c) => matches(c, where));
        if (orderBy?.createdAt === "desc") {
          candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        }
        return candidates[0] ?? null;
      },
      create: async ({ data }: any) => {
        const now = new Date().toISOString();
        const record = { id: randomUUID(), createdAt: now, updatedAt: now, nlpearlCallId: null, ...data };
        nlpearlCalls.set(record.id, record);
        return record;
      },
      update: async ({ where, data }: any) => {
        const existing = nlpearlCalls.get(where.id);
        if (!existing) throw new Error(`NlpearlCall ${where.id} not found`);
        const updated = { ...existing, ...data, updatedAt: new Date().toISOString() };
        nlpearlCalls.set(where.id, updated);
        return updated;
      },
    },
    $transaction: async (ops: Promise<any>[]) => Promise.all(ops),
    $queryRaw: async () => 1,
  };
}
