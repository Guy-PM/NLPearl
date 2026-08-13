import { FlowRunStatus } from "@nlpearl/shared-types";

export interface FlowRun {
  id: string;
  requestId: string;
  flowType: string;
  mpl: string;
  phone: string;
  name: string;
  cfaUrl: string | null;
  status: FlowRunStatus;
  nlpearlCallId: string | null;
  callStatus: string | null;
  conversationStatus: string | null;
  duration: number | null;
  summary: string | null;
  recordingUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowRunEvent {
  id: string;
  status: FlowRunStatus;
  detail: string | null;
  createdAt: string;
}

export interface FlowRunDetail extends FlowRun {
  events: FlowRunEvent[];
}

export interface FlowRunListResponse {
  items: FlowRun[];
  total: number;
  page: number;
  pageSize: number;
}

export interface FlowConfig {
  id: string;
  flowType: string;
  nlpearlOutboundId: string;
  preliminarySmsTemplate: string;
  consentSmsTemplate: string;
  delayMinutes: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export { FlowRunStatus };
