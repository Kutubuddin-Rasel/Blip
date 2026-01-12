export interface CreatedConversation {
  id: string;
  name: string | null;
}

export interface Conversation extends CreatedConversation {
  messages: {
    id: string;
    createdAt: Date;
    content: string;
    userId: string;
    conversationId: string;
  }[];
}

export interface Conversations extends Conversation {
  users: {
    id: string;
    name: string;
    avatar: string | null;
  }[];
}
