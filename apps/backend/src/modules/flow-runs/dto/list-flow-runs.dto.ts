import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { FlowRunStatus } from "@nlpearl/database";

export class ListFlowRunsDto {
  @IsOptional()
  @IsString()
  flowType?: string;

  @IsOptional()
  @IsIn(Object.values(FlowRunStatus))
  status?: FlowRunStatus;

  @IsOptional()
  @IsString()
  search?: string; // matches against mpl, phone, or name

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 25;
}
