import { IsOptional, IsString } from "class-validator";

/**
 * Fired by the "API Node" configured inside the NLPearl Pearl's
 * conversation flow when the client verbally agrees to receive the SMS
 * with the CTA link. Field names must match whatever's configured on
 * that API Node in the NLPearl dashboard — mpl/phone/flowType is the
 * minimum needed to join back to a FlowRun.
 */
export class NlpearlConsentWebhookDto {
  @IsString()
  mpl!: string;

  @IsString()
  phone!: string;

  @IsString()
  flowType!: string;
}

/**
 * NLPearl's native Call webhook, fired at call start and end (V2 shape).
 * We only need `id` (the call id) and `to` (to correlate back to a
 * FlowRun by phone) — the rest of the call detail is fetched via
 * NlpearlService.getCall().
 */
export class NlpearlCallEndedWebhookDto {
  @IsString()
  id!: string;

  @IsOptional()
  @IsString()
  to?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
