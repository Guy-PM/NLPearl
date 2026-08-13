import { IsOptional, IsString } from "class-validator";

export class FlowTriggerDto {
  @IsOptional()
  @IsString()
  requestId?: string;

  @IsString()
  flowType!: string;

  @IsString()
  name!: string;

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
