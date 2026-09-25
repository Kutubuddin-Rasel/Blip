import { BadRequestException } from '@nestjs/common';

export function directKey(firstId: string, secondId: string): string {
  if (firstId === secondId) {
    throw new BadRequestException('Cannot start a conversation with yourself');
  }
  return [firstId, secondId].sort().join(':');
}

export function isCanonicalDirect(
  key: string | null,
  users: { id: string }[],
  currentUserId: string,
): boolean {
  if (!key || users.length !== 2) return false;
  const peer = users.find((user) => user.id !== currentUserId);
  return (
    !!peer &&
    users.some((user) => user.id === currentUserId) &&
    directKey(currentUserId, peer.id) === key
  );
}
