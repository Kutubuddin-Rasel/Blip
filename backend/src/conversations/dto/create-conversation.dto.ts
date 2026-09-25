import {
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateConversationDto {
  @IsUUID('4')
  recipientId: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  @MaxLength(4000)
  @Matches(/\S/, { message: 'Initial message must contain text' })
  initialMessage?: string;

  @ValidateIf((_, value) => value !== undefined)
  @IsUUID('4')
  clientMessageId?: string;
}
