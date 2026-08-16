import { IsBoolean, IsString } from "class-validator";

/**
 * N8N webhook confirming (by its own separate check) that a client
 * completed the CTA action. Correlated back to a FlowRun by (phone, flow)
 * — mpl+phone can repeat across different flows, but a given phone only
 * ever appears once within a single flow, so (phone, flow) pins down the
 * record.
 */
export class CtaCompleteWebhookDto {
  @IsString()
  phone!: string;

  @IsString()
  flow!: string;

  @IsBoolean()
  cta_complete!: boolean;
}
