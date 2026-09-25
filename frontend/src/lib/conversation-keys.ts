export const conversationKeys = {
  list: (accountId: string | null) => ["account", accountId, "conversations"] as const,
  detail: (accountId: string | null, id: string) => ["account", accountId, "conversation", id] as const,
  messages: (accountId: string | null, id: string | null) => ["account", accountId, "messages", id] as const,
};
