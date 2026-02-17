import { Message } from "./Conversation.interface";

export interface MessageResponse {
  items: Message[];
  nextCursor: string | null;
}
