export interface Conversation {
  id: string;
  name: string | null;
  lastMessageAt: Date;
  users: {
    id: string;
    name: string;
    avatar: string | null;
  }[];
  messages: {
    id: string;
    createdAt: Date;
    content: string;
    userId: string;
    conversationId: string;
  }[];
}

export interface ChatSidebarProps{
    conversations: Conversation[];
}