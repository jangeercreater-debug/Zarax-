import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class SearchKnowledgeBaseDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  query!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** Required when the caller is a service_account Principal (e.g. llm-orchestrator
   * or workflow-engine acting on behalf of a specific tenant's request) — see
   * @zarax/shared-auth's resolveEffectiveTenantId for why a service account's own
   * bound tenant can't be used directly. Ignored for a user/api_key Principal, whose
   * own authenticated tenantId is always authoritative. */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
