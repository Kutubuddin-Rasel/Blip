import { IsNotEmpty, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateMessageDto {
  @IsUUID()
  conversationId: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  content: string;
}
