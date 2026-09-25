import { BadRequestException } from '@nestjs/common';

export function directKey(firstId: string, secondId: string): string {
  if (firstId === secondId) {
    throw new BadRequestException('Cannot start a conversation with yourself');
  }
  return [firstId, secondId].sort().join(':');
}
