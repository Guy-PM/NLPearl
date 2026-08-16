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

/**
 * Whether a just-finished call should trigger an automatic retry, per the
 * flow's own configurable rules (attempt cap, call/conversation status
 * codes, minimum call duration). `attemptCount` is the number of attempts
 * already made (including the one that just finished).
 */
export function needsRetry(config: FlowConfig, attemptCount: number, call: FinishedCall): boolean {
  if (config.maxRetryAttempts <= 0) return false;
  if (attemptCount >= config.maxRetryAttempts + 1) return false;

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
