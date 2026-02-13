export interface Message {
  id: string;
  createdAt: Date;
  content: string;
  userId: string;
}
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
export interface CreatedConversation {
  id: string;
  name: string | null;
  lastMessageAt: Date;
}

export interface ChatSidebarProps {
  initialConversations: Conversation[];
}

export interface User {
  id: string;
  name: string;
  avatar: string | null;
  phoneNumber: string;
}

export interface AllUsers {
  items: User[];
  nextCursor: string | null;
}

export interface ChatAreaProps {
  conversation?: Conversation;
  draftUserId: string | null;
  userName: string | null;
}

export interface ChatInputProps {
  onSend: (text: string) => void;
  disable: boolean;
}
export interface ChatListProps{
  messages:Message[]
}