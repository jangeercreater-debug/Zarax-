import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class ConversationTurnDto {
  @IsString()
  @MinLength(1)
  @MaxLength(10_000)
  text!: string;

  @IsString()
  @MinLength(1)
  agentId!: string;

  /** Required when the caller is a service_account Principal (services/api's "Test
   * Agent", workflow-engine's AI Agent node) — see @zarax/shared-auth's
   * resolveEffectiveTenantId for why a service account's own bound tenant can't be
   * used directly. Ignored for a user/api_key Principal. */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
