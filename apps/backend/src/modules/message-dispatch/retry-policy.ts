import { FlowConfig } from "@nlpearl/database";

interface FinishedCall {
  callStatus: string | null;
  conversationStatus: string | null;
  duration: number | null;
}

function parseCsv(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Shared by both retry checks below. `attemptCount` includes the attempt just made. */
function withinRetryCap(config: FlowConfig, attemptCount: number): boolean {
  return config.maxRetryAttempts > 0 && attemptCount < config.maxRetryAttempts + 1;
}

/**
 * Whether a just-finished call should trigger an automatic retry, per the
 * flow's own configurable rules (attempt cap, call/conversation status
 * codes, minimum call duration). `attemptCount` is the number of attempts
 * already made (including the one that just finished).
 */
export function needsRetry(config: FlowConfig, attemptCount: number, call: FinishedCall): boolean {
  if (!withinRetryCap(config, attemptCount)) return false;

  const callStatuses = parseCsv(config.retryOnCallStatuses);
  if (call.callStatus && callStatuses.includes(call.callStatus)) return true;

  const conversationStatuses = parseCsv(config.retryOnConversationStatuses);
  if (call.conversationStatus && conversationStatuses.includes(call.conversationStatus)) return true;

  if (
    config.retryMinCallDurationSeconds != null &&
    call.duration != null &&
    call.duration < config.retryMinCallDurationSeconds
  ) {
    return true;
  }

  return false;
}

/**
 * Whether a failed call-trigger attempt (the NLPearl API call to place the
 * call itself errored — e.g. the outbound is inactive) should be retried.
 * Unlike `needsRetry`, there's no call outcome to evaluate here since the
 * call never happened — only the flow's attempt cap decides.
 */
export function needsRetryAfterTriggerFailure(config: FlowConfig, attemptCount: number): boolean {
  return withinRetryCap(config, attemptCount);
}
