import { IsString, MinLength } from 'class-validator';

export class SwitchTenantDto {
  @IsString()
  @MinLength(1)
  tenantId!: string;
}
