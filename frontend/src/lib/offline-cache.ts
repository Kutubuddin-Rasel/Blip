import { dehydrate, hashKey, hydrate, type DehydratedState, type QueryClient } from "@tanstack/react-query";

export const CACHE_VERSION = 1;
export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_HISTORY_PAGES = 10;
const MAX_CONVERSATIONS = 200;
const MAX_DETAILS = 30;
const MAX_HISTORIES = 30;
const MAX_BYTES = 5 * 1024 * 1024;
const DB_NAME = "blip-offline";
const STORE_NAME = "entries";
const MARKER_KEY = "last-account";
const cacheKey = (userId: string, version = CACHE_VERSION) => `blip-cache:${version}:${userId}`;

export interface CacheStore {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export class IndexedDbCacheStore implements CacheStore {
  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, CACHE_VERSION);
      request.onupgradeneeded = () => {
        if (request.result.objectStoreNames.contains(STORE_NAME)) request.result.deleteObjectStore(STORE_NAME);
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async transact<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, done: (value: T) => void) => void): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      let value: T;
      transaction.oncomplete = () => { db.close(); resolve(value); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
      work(transaction.objectStore(STORE_NAME), (result) => { value = result; });
    });
  }

  get(key: string): Promise<unknown> {
    return this.transact("readonly", (store, done) => {
      const request = store.get(key);
      request.onsuccess = () => done(request.result);
    });
  }

  put(key: string, value: unknown): Promise<void> {
    return this.transact("readwrite", (store) => { store.put(value, key); });
  }

  remove(key: string): Promise<void> {
    return this.transact("readwrite", (store) => { store.delete(key); });
  }
}

type QueryKind = "list" | "detail" | "messages";
type StoredSnapshot = { version: number; userId: string; savedAt: number; state: DehydratedState };
const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const string = (value: unknown): value is string => typeof value === "string";
const optionalString = (value: unknown): value is string | null => value === null || string(value);

function kind(key: readonly unknown[], userId: string): QueryKind | null {
  if (key[0] !== "account" || key[1] !== userId) return null;
  if (key.length === 3 && key[2] === "conversations") return "list";
  if (key.length === 4 && string(key[3]) && key[2] === "conversation") return "detail";
  if (key.length === 4 && string(key[3]) && key[2] === "messages") return "messages";
  return null;
}

function peer(value: unknown) {
  const item = object(value);
  if (!item || !string(item.id) || !string(item.name) || !optionalString(item.avatar) || typeof item.isDeleted !== "boolean") return null;
  return { id: item.id, name: item.isDeleted ? "Deleted user" : item.name, avatar: null, isDeleted: item.isDeleted };
}

function summary(value: unknown) {
  const item = object(value);
  const person = peer(item?.peer);
  const preview = object(item?.latestMessage);
  if (!item || !string(item.id) || item.kind !== "direct" || !person || !optionalString(item.lastMessageAt)) return null;
  if (item.latestMessage !== null && (!preview || !string(preview.id) || !string(preview.content) || !string(preview.createdAt))) return null;
  return {
    id: item.id, kind: "direct", peer: person, lastMessageAt: item.lastMessageAt,
    latestMessage: preview ? { id: preview.id, content: preview.content, createdAt: preview.createdAt } : null,
  };
}

function detail(value: unknown) {
  const item = object(value);
  const person = peer(item?.peer);
  if (!item || !string(item.id) || item.kind !== "direct" || !person || !optionalString(item.lastMessageAt) || typeof item.canMessage !== "boolean" || typeof item.blockedByMe !== "boolean") return null;
  return { id: item.id, kind: "direct", peer: person, lastMessageAt: item.lastMessageAt, canMessage: item.canMessage, blockedByMe: item.blockedByMe };
}

function message(value: unknown) {
  const item = object(value);
  if (!item || !string(item.id) || !string(item.clientMessageId) || !string(item.createdAt) || !string(item.content) || !string(item.senderId) || !string(item.conversationId)) return null;
  return { id: item.id, clientMessageId: item.clientMessageId, createdAt: item.createdAt, content: item.content, senderId: item.senderId, conversationId: item.conversationId };
}

function history(value: unknown) {
  const data = object(value);
  if (!data || !Array.isArray(data.pages) || !Array.isArray(data.pageParams) || data.pages.length !== data.pageParams.length) return null;
  const pages = data.pages.slice(0, MAX_HISTORY_PAGES).map((value) => {
    const page = object(value);
    if (!page || !Array.isArray(page.items) || !optionalString(page.nextCursor)) return null;
    const items = page.items.map(message);
    if (items.some((item) => item === null)) return null;
    return { items, nextCursor: page.nextCursor };
  });
  if (pages.some((page) => page === null)) return null;
  const pageParams = data.pageParams.slice(0, MAX_HISTORY_PAGES);
  if (pageParams.some((param) => param !== undefined && !string(param))) return null;
  return { pages, pageParams };
}

function safeQueries(state: DehydratedState, userId: string): DehydratedState {
  const lists: DehydratedState["queries"] = [];
  const details: DehydratedState["queries"] = [];
  const histories: DehydratedState["queries"] = [];
  for (const query of state.queries) {
    if (!query || !Array.isArray(query.queryKey) || !object(query.state) || !Number.isFinite(query.state.dataUpdatedAt)) continue;
    const type = kind(query.queryKey, userId);
    if (!type || query.state.status !== "success") continue;
    const data = type === "list"
      ? Array.isArray(query.state.data) ? query.state.data.slice(0, MAX_CONVERSATIONS).map(summary) : null
      : type === "detail" ? detail(query.state.data) : history(query.state.data);
    if (data === null || (Array.isArray(data) && data.some((item) => item === null))) continue;
    const safe = {
      queryKey: query.queryKey,
      queryHash: hashKey(query.queryKey),
      state: {
        data,
        dataUpdateCount: 1,
        dataUpdatedAt: query.state.dataUpdatedAt,
        error: null,
        errorUpdateCount: 0,
        errorUpdatedAt: 0,
        fetchFailureCount: 0,
        fetchFailureReason: null,
        fetchMeta: null,
        isInvalidated: false,
        status: "success" as const,
        fetchStatus: "idle" as const,
      },
    };
    if (type === "list") lists.push(safe);
    else if (type === "detail") details.push(safe);
    else histories.push(safe);
  }
  const newest = (a: DehydratedState["queries"][number], b: DehydratedState["queries"][number]) => b.state.dataUpdatedAt - a.state.dataUpdatedAt;
  const queries = [...lists.slice(0, 1), ...details.sort(newest).slice(0, MAX_DETAILS), ...histories.sort(newest).slice(0, MAX_HISTORIES)];
  const deleted = new Set<string>();
  for (const query of queries) {
    if (kind(query.queryKey, userId) === "list") {
      for (const item of query.state.data as Array<ReturnType<typeof summary>>) if (item?.peer.isDeleted) deleted.add(item.peer.id);
    } else if (kind(query.queryKey, userId) === "detail") {
      const item = query.state.data as ReturnType<typeof detail>;
      if (item?.peer.isDeleted) deleted.add(item.peer.id);
    }
  }
  for (const query of queries) {
    const type = kind(query.queryKey, userId);
    if (type === "list") {
      query.state.data = (query.state.data as Array<NonNullable<ReturnType<typeof summary>>>).map((item) =>
        deleted.has(item.peer.id) ? { ...item, peer: { ...item.peer, name: "Deleted user", avatar: null, isDeleted: true } } : item);
    } else if (type === "detail") {
      const item = query.state.data as NonNullable<ReturnType<typeof detail>>;
      if (deleted.has(item.peer.id)) query.state.data = { ...item, peer: { ...item.peer, name: "Deleted user", avatar: null, isDeleted: true }, canMessage: false, blockedByMe: false };
    }
  }
  return { mutations: [], queries };
}

function snapshot(client: QueryClient, userId: string): StoredSnapshot | null {
  const dehydrated = dehydrate(client, {
    shouldDehydrateMutation: () => false,
    shouldDehydrateQuery: (query) => query.state.status === "success" && kind(query.queryKey, userId) !== null,
  });
  const state = safeQueries(dehydrated, userId);
  while (new TextEncoder().encode(JSON.stringify(state)).length > MAX_BYTES) {
    const lastHistory = state.queries.findLastIndex((query) => kind(query.queryKey, userId) === "messages");
    const lastDetail = state.queries.findLastIndex((query) => kind(query.queryKey, userId) === "detail");
    const index = lastHistory >= 0 ? lastHistory : lastDetail;
    if (index < 0) return null;
    state.queries.splice(index, 1);
  }
  return { version: CACHE_VERSION, userId, savedAt: Date.now(), state };
}

export class OfflineCache {
  private readonly client: QueryClient;
  private readonly store: CacheStore;
  private activeId: string | null = null;
  private viewingId: string | null = null;
  private epoch = 0;
  private unsubscribe: (() => void) | null = null;
  private writing: Promise<void> = Promise.resolve();
  private transition: Promise<void> = Promise.resolve();

  constructor(client: QueryClient, store: CacheStore = new IndexedDbCacheStore()) {
    this.client = client;
    this.store = store;
  }

  private run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.transition.then(work, work);
    this.transition = next.then(() => {}, () => {});
    return next;
  }

  private async read(key: string): Promise<unknown> {
    try { return await this.store.get(key); } catch { return null; }
  }

  private async write(key: string, value: unknown): Promise<void> {
    try { await this.store.put(key, value); } catch { console.warn("Offline cache storage unavailable"); }
  }

  private async remove(key: string): Promise<void> {
    try { await this.store.remove(key); } catch { console.warn("Offline cache cleanup unavailable"); }
  }

  private async marker(): Promise<{ version: number; userId: string } | null> {
    const value = object(await this.read(MARKER_KEY));
    if (!value || !string(value.userId) || !Number.isInteger(value.version)) return null;
    if (value.version !== CACHE_VERSION) {
      await this.remove(cacheKey(value.userId, value.version as number));
      await this.remove(MARKER_KEY);
      return null;
    }
    return { version: CACHE_VERSION, userId: value.userId };
  }

  private async load(userId: string): Promise<DehydratedState | null> {
    const value = object(await this.read(cacheKey(userId)));
    if (!value) return null;
    const valid = value.version === CACHE_VERSION && value.userId === userId && typeof value.savedAt === "number" &&
      value.savedAt <= Date.now() && Date.now() - value.savedAt <= CACHE_MAX_AGE_MS;
    const raw = object(value.state);
    if (!valid || !raw || !Array.isArray(raw.queries)) {
      await this.remove(cacheKey(userId));
      return null;
    }
    try { return safeQueries({ mutations: [], queries: raw.queries as DehydratedState["queries"] }, userId); }
    catch { await this.remove(cacheKey(userId)); return null; }
  }

  private async stop(): Promise<void> {
    this.epoch += 1;
    this.activeId = null;
    this.unsubscribe?.();
    this.unsubscribe = null;
    await this.writing;
  }

  activate(userId: string): Promise<void> {
    return this.run(async () => {
      if (this.activeId === userId) return;
      await this.stop();
      if (this.viewingId && this.viewingId !== userId) {
        await this.client.cancelQueries();
        this.client.clear();
      }
      const previous = await this.marker();
      if (previous && previous.userId !== userId) {
        await this.remove(cacheKey(previous.userId));
        await this.remove(MARKER_KEY);
      }
      const state = await this.load(userId);
      if (state) hydrate(this.client, state, { defaultOptions: { queries: { gcTime: CACHE_MAX_AGE_MS } } });
      await this.write(MARKER_KEY, { version: CACHE_VERSION, userId });
      this.activeId = userId;
      this.viewingId = userId;
      const epoch = this.epoch;
      this.unsubscribe = this.client.getQueryCache().subscribe((event) => {
        if (event.type !== "updated" || event.action.type !== "success" || kind(event.query.queryKey, userId) === null) return;
        this.writing = this.writing.then(async () => {
          if (this.activeId !== userId || this.epoch !== epoch) return;
          const value = snapshot(this.client, userId);
          if (value) await this.write(cacheKey(userId), value);
        }).catch(() => { console.warn("Offline cache storage unavailable"); });
      });
    });
  }

  readOnly(): Promise<string | null> {
    return this.run(async () => {
      const previous = this.activeId ?? this.viewingId;
      await this.stop();
      const marker = await this.marker();
      if (!marker || (previous && previous !== marker.userId)) return null;
      const state = await this.load(marker.userId);
      if (!state?.queries.length) return null;
      hydrate(this.client, state, { defaultOptions: { queries: { gcTime: CACHE_MAX_AGE_MS } } });
      this.viewingId = marker.userId;
      return marker.userId;
    });
  }

  wipe(accountId?: string | null): Promise<void> {
    return this.run(async () => {
      const active = accountId ?? this.activeId ?? this.viewingId;
      await this.stop();
      this.viewingId = null;
      const marker = await this.marker();
      if (active) {
        await this.remove(cacheKey(active));
        if (marker?.userId === active) await this.remove(MARKER_KEY);
      } else if (marker) {
        await this.remove(cacheKey(marker.userId));
        await this.remove(MARKER_KEY);
      }
    });
  }

  async flush(): Promise<void> { await this.writing; }
}

export async function wipeLocalAccount(cache: OfflineCache | null, client: QueryClient | null, accountId?: string | null): Promise<void> {
  await cache?.wipe(accountId);
  if (client) {
    await client.cancelQueries();
    client.clear();
  }
}
