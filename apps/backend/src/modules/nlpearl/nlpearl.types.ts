/** https://developers.nlpearl.ai/api-reference/v1/outbound/make-call */
export interface MakeCallRequest {
  to: string;
  callData?: Record<string, unknown>;
}

export interface MakeCallResponse {
  id: string;
  from: string;
  to: string;
  queuePosition?: number;
}

/** https://developers.nlpearl.ai/api-reference/v2/call/get-call */
export interface GetCallResponse {
  id: string;
  pearlId: string;
  leadId: string | null;
  startTime: string;
  duration: number | null;
  status: number;
  conversationStatus: number;
  recording: string | null;
  summary: string | null;
  collectedInfo: unknown;
  overallSentiment: number | null;
  tags: string[];
}

/** https://developers.nlpearl.ai/api-reference/v1/account/get-account */
export interface GetAccountResponse {
  name: string;
  totalAgents: number;
  creditBalance: number;
  status: number;
}
