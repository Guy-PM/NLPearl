import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class FlowTriggerDto {
  @IsOptional()
  @IsString()
  requestId?: string;

  @IsString()
  @IsNotEmpty()
  flowType!: string;

  // An explicit `name` is accepted as an override, but `first_name`/
  // `last_name` are the required shape — see IngestService.resolveFullName.
  @IsOptional()
  @IsString()
  name?: string;

  @IsString()
  @IsNotEmpty()
  first_name!: string;

  @IsString()
  @IsNotEmpty()
  last_name!: string;

  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @IsNotEmpty()
  mpl!: string;

  @IsString()
  @IsNotEmpty()
  partner!: string;

  @IsOptional()
  @IsString()
  cfaUrl?: string;

  // Additional flow-specific fields from N8N are allowed through and
  // stored verbatim on FlowRun.rawPayload — see IngestController.
  [key: string]: unknown;
}
