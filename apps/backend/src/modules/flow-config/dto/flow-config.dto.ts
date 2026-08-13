import { IsBoolean, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateFlowConfigDto {
  @IsString()
  flowType!: string;

  @IsString()
  nlpearlOutboundId!: string;

  @IsString()
  preliminarySmsTemplate!: string;

  @IsString()
  consentSmsTemplate!: string;

  @IsInt()
  @Min(0)
  delayMinutes!: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpdateFlowConfigDto {
  @IsOptional()
  @IsString()
  nlpearlOutboundId?: string;

  @IsOptional()
  @IsString()
  preliminarySmsTemplate?: string;

  @IsOptional()
  @IsString()
  consentSmsTemplate?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  delayMinutes?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
