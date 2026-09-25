import { ConversationDetail, ConversationSummary, StartDirectRequest, StartDirectResult } from "@/interface/Conversation.interface";
import api from "@/lib/api";

export const ChatService = {
  getConversations: async (): Promise<ConversationSummary[]> => {
    const response = await api.get<ConversationSummary[]>("/conversations");
    return response.data;
  },

  createConversation: async (request: StartDirectRequest): Promise<StartDirectResult> => {
    const response = await api.post<StartDirectResult>("/conversations/create", request);
    return response.data;
  },

  getConversation: async (conversationId: string): Promise<ConversationDetail> => {
    const response = await api.get<ConversationDetail>(`/conversations/${conversationId}`);
    return response.data;
  },
};
