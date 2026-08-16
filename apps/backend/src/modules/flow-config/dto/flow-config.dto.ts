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

  // Cron expression (e.g. "0 10,15 * * 0-4") controlling when pending
  // records for this flow get sent as a batch. Omit to send immediately
  // on ingest, same as before this field existed.
  @IsOptional()
  @IsString()
  sendSchedule?: string;

  @IsOptional()
  @IsString()
  sendTimezone?: string;

  // Retry policy — see FlowConfig schema comments for the exact semantics.
  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetryAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryDelayMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryMinCallDurationSeconds?: number;

  @IsOptional()
  @IsString()
  retryOnCallStatuses?: string;

  @IsOptional()
  @IsString()
  retryOnConversationStatuses?: string;

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
  @IsString()
  sendSchedule?: string;

  @IsOptional()
  @IsString()
  sendTimezone?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxRetryAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryDelayMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  retryMinCallDurationSeconds?: number;

  @IsOptional()
  @IsString()
  retryOnCallStatuses?: string;

  @IsOptional()
  @IsString()
  retryOnConversationStatuses?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
