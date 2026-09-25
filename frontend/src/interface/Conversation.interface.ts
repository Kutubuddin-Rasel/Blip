import type { Message } from "./Message.interface";

export interface User {
  id: string;
  name: string;
  avatar: string | null;
}

export type UserDiscoveryResult = User;

export interface MessagePreview {
  id: string;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  kind: "direct";
  peer: User;
  latestMessage: MessagePreview | null;
  lastMessageAt: string | null;
}

export interface ConversationDetail {
  id: string;
  kind: "direct";
  peer: User;
  lastMessageAt: string | null;
}

export interface StartDirectRequest {
  recipientId: string;
  initialMessage?: string;
  clientMessageId?: string;
}

export interface StartDirectResult {
  conversation: ConversationDetail;
  message: Message | null;
}

export type ChatAreaProps =
  | { mode: "draft"; draftUserId: string; userName: string | null; conversation?: never }
  | { mode: "existing"; conversation: ConversationDetail; draftUserId?: never; userName?: never };

export interface ChatInputProps {
  onSend: (text: string) => void | Promise<unknown>;
  onEdit?: () => void;
  disable: boolean;
  clearOnSuccess?: boolean;
  failure?: { retryable: boolean; message: string } | null;
}
