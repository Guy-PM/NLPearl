import { Injectable } from "@nestjs/common";
import { FlowRunStatus } from "@nlpearl/database";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Shared status-transition helper: updates FlowRun.status and appends
 * an immutable FlowRunEvent in the same write. Used by every module that
 * moves a FlowRun through the pipeline (ingest, the delayed call-trigger
 * job, and the two NLPearl webhooks) so the event trail stays complete
 * regardless of which module drove the transition.
 */
@Injectable()
export class FlowRunTransitionService {
  constructor(private readonly prisma: PrismaService) {}

  transition(flowRunId: string, status: FlowRunStatus, detail?: string) {
    return this.prisma.flowRun.update({
      where: { id: flowRunId },
      data: { status, events: { create: { status, detail } } },
    });
  }

  fail(flowRunId: string, errorMessage: string) {
    return this.prisma.flowRun.update({
      where: { id: flowRunId },
      data: {
        status: FlowRunStatus.Failed,
        errorMessage,
        events: { create: { status: FlowRunStatus.Failed, detail: errorMessage } },
      },
    });
  }
}
