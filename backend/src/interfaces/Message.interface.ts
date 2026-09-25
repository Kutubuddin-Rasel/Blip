export interface Message {
  id: string;
  clientMessageId: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}
