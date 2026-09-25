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
  blockPeer: async (peerId: string): Promise<void> => { await api.post(`/users/${peerId}/block`); },
  unblockPeer: async (peerId: string): Promise<void> => { await api.delete(`/users/${peerId}/block`); },
};
