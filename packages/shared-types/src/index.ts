export enum FlowRunStatus {
  Received = "Received",
  PreSmsSent = "PreSmsSent",
  Scheduled = "Scheduled",
  CallTriggered = "CallTriggered",
  ConsentGiven = "ConsentGiven",
  CallEnded = "CallEnded",
  Completed = "Completed",
  Failed = "Failed",
}

export interface FlowTriggerPayload {
  requestId?: string;
  flowType: string;
  name: string;
  phone: string;
  mpl: string;
  cfaUrl?: string;
  [key: string]: unknown;
}

export interface NlpearlConsentWebhookPayload {
  mpl: string;
  phone: string;
  flowType: string;
  callId?: string;
}

export interface NlpearlCallEndedWebhookPayload {
  id: string;
  pearlId?: string;
  leadId?: string | null;
}
