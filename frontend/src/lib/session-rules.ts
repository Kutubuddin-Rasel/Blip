export function canRetry(originalUserId: string | null, currentUserId: string | null, refreshedUserId: string): boolean {
  return originalUserId !== null && originalUserId === currentUserId && currentUserId === refreshedUserId;
}

export const canUseServer = (status: string, online: boolean, token: string | null): boolean =>
  status === "authenticated" && online && !!token;

export function singleFlight<T>(work: (generation: number) => Promise<T>, generation: () => number): () => Promise<T> {
  let pending: Promise<T> | null = null;
  let pendingGeneration: number | null = null;
  return () => {
    const current = generation();
    if (!pending || pendingGeneration !== current) {
      pendingGeneration = current;
      const task = Promise.resolve().then(() => work(current));
      const wrapped = task.finally(() => { if (pending === wrapped) { pending = null; pendingGeneration = null; } });
      pending = wrapped;
    }
    return pending;
  };
}

export async function retryForSameAccount<T>(
  originalUserId: string,
  currentUserId: () => string | null,
  refresh: () => Promise<{ user: { id: string }; accessToken: string }>,
  retry: (token: string) => Promise<T>,
): Promise<T> {
  if (currentUserId() !== originalUserId) throw new Error("Session changed while request was in progress");
  const session = await refresh();
  if (!canRetry(originalUserId, currentUserId(), session.user.id)) throw new Error("Session changed while request was in progress");
  return retry(session.accessToken);
}

export function sessionEventAction(type: unknown, userId: unknown): "end" | "rebootstrap" | "ignore" {
  if (type === "session.ended") return "end";
  if ((type === "session.established" || type === "session.changed") && typeof userId === "string") return "rebootstrap";
  return "ignore";
}

export async function installWithIsolation(
  cachedAccountId: string | null,
  nextAccountId: string,
  clear: () => Promise<void>,
  install: () => void | Promise<void>,
): Promise<void> {
  if (cachedAccountId && cachedAccountId !== nextAccountId) await clear();
  await install();
}
