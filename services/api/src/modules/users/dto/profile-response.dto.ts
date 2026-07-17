export interface ProfileResponseDto {
  id: string;
  email: string;
  fullName: string | null;
  emailVerified: boolean;
}

export interface MembershipResponseDto {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: string;
}

export interface SessionResponseDto {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  lastUsedAt: string;
  isCurrent: boolean;
}
