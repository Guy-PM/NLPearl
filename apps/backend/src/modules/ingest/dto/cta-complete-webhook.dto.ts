import { IsBoolean, IsNotEmpty, IsString } from "class-validator";

/**
 * N8N webhook confirming (by its own separate check) that a client
 * completed the CTA action. Correlated back to a FlowRun by (phone, flow,
 * mpl) — the same triple used to identify a record on ingest, since a
 * phone can now appear more than once within the same flow (different
 * mpls), so (phone, flow) alone no longer pins down a single record.
 */
export class CtaCompleteWebhookDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  flow!: string;

  @IsString()
  @IsNotEmpty()
  mpl!: string;

  @IsBoolean()
  cta_complete!: boolean;
}
