import { IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateMessageDto {
  @IsUUID('4')
  conversationId: string;

  @IsUUID('4')
  clientMessageId: string;

  @IsString()
  @Matches(/\S/)
  @MaxLength(4000)
  content: string;
}
