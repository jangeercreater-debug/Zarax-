export interface AgentResponseDto {
  id: string;
  name: string;
  isActive: boolean;
  config: Record<string, unknown>;
  currentVersion: number;
}

export interface AgentVersionResponseDto {
  id: string;
  version: number;
  config: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
}
