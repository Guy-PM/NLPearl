import { IsOptional, IsString } from "class-validator";

export class FlowTriggerDto {
  @IsOptional()
  @IsString()
  requestId?: string;

  @IsString()
  flowType!: string;

  // Some flows send a single `name`, others send `first_name`/`last_name`
  // separately (as N8N's real payloads do) — at least one shape must
  // resolve to a non-empty full name; see IngestService.resolveFullName.
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  first_name?: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsString()
  phone!: string;

  @IsString()
  mpl!: string;

  @IsOptional()
  @IsString()
  cfaUrl?: string;

  // Additional flow-specific fields from N8N are allowed through and
  // stored verbatim on FlowRun.rawPayload — see IngestController.
  [key: string]: unknown;
}
