export interface ConversationTurnResponseDto {
  response: string;
  shouldEndCall: boolean;
  endCallReason?: string;
}
