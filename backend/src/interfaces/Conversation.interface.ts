export interface ConversationPeer {
  id: string;
  name: string;
  avatar: string | null;
}

export interface MessagePreview {
  id: string;
  content: string;
  createdAt: string;
}

export interface ConversationSummary {
  id: string;
  kind: 'direct';
  peer: ConversationPeer;
  latestMessage: MessagePreview | null;
  lastMessageAt: string | null;
}

export interface ConversationDetail {
  id: string;
  kind: 'direct';
  peer: ConversationPeer;
  lastMessageAt: string | null;
}

import type { Message } from './Message.interface';

export interface StartDirectResult {
  conversation: ConversationDetail;
  message: Message | null;
}
