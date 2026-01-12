import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateConversationDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  userIds: Array<string>;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @MinLength(1)
  @IsString()
  initialMessage?: string;
}
