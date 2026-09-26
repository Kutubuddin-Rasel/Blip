import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { QueryClient } from '@tanstack/react-query';
import { CACHE_VERSION, IndexedDbCacheStore, MAX_HISTORY_PAGES, OfflineCache, wipeLocalAccount } from '../src/lib/offline-cache.ts';
import { installWithIsolation } from '../src/lib/session-rules.ts';

const key = (id) => `blip-cache:${CACHE_VERSION}:${id}`;
const listKey = (id) => ['account', id, 'conversations'];
const detailKey = (id, chat) => ['account', id, 'conversation', chat];
const messagesKey = (id, chat) => ['account', id, 'messages', chat];
const client = () => new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
const peer = (name = 'Bob', isDeleted = false) => ({ id: 'peer', name, avatar: 'avatar.png', isDeleted });
const summary = (name = 'Bob', isDeleted = false) => ({
  id: 'chat', kind: 'direct', peer: peer(name, isDeleted), lastMessageAt: '2026-09-25T00:00:00.000Z',
  latestMessage: { id: 'preview', content: 'hello', createdAt: '2026-09-25T00:00:00.000Z' },
});
const detail = (name = 'Bob', isDeleted = false) => ({
  id: 'chat', kind: 'direct', peer: peer(name, isDeleted), lastMessageAt: null,
  canMessage: !isDeleted, blockedByMe: false,
});
const page = (index, nextCursor) => ({
  items: [{ id: `message-${index}`, clientMessageId: `client-${index}`, createdAt: '2026-09-25T00:00:00.000Z', content: `body ${index}`, senderId: 'peer', conversationId: 'chat' }],
  nextCursor,
});

async function resetDatabase() {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('blip-offline');
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}

test('only projected conversation and history data enters IndexedDB; auth, discovery and mutations stay out', async () => {
  await resetDatabase();
  const store = new IndexedDbCacheStore();
  const query = client();
  const cache = new OfflineCache(query, store);
  await cache.activate('A');
  query.setQueryDefaults(listKey('A'), { meta: { accessToken: 'meta-secret' } });
  query.setQueryData(['auth', 'A'], { accessToken: 'access-secret', refreshToken: 'refresh-secret', firebaseUid: 'firebase-secret', otp: 'otp-secret' });
  query.setQueryData(['account', 'A', 'discovery'], { phoneNumber: '+14155551234', name: 'discovery-secret' });
  query.setQueryData(['account', 'A', 'selectedRecipient'], { phoneNumber: '+14155551234' });
  const pending = query.getMutationCache().build(query, { mutationKey: ['send'], mutationFn: () => new Promise(() => {}) });
  void pending.execute({ content: 'pending-secret' });
  query.setQueryData(listKey('A'), [{ ...summary(), peer: { ...peer(), avatar: 'https://example.test/avatar?token=avatar-secret', phoneNumber: '+14155551234', firebaseUid: 'firebase-secret' }, accessToken: 'access-secret' }]);
  query.setQueryData(detailKey('A', 'chat'), { ...detail(), refreshToken: 'refresh-secret' });
  query.setQueryData(messagesKey('A', 'chat'), {
    pages: [{ ...page(1, 'cursor-1'), items: [{ ...page(1, 'cursor-1').items[0], otp: 'otp-secret' }] }, page(2, 'cursor-2')],
    pageParams: [undefined, 'cursor-1'],
  });
  await cache.flush();
  const stored = await store.get(key('A'));
  assert.equal(stored.state.queries.length, 3);
  assert.deepEqual(stored.state.mutations, []);
  assert.deepEqual(stored.state.queries.map((entry) => entry.queryKey[2]).sort(), ['conversation', 'conversations', 'messages']);
  const text = JSON.stringify(stored);
  for (const secret of ['access-secret', 'refresh-secret', 'firebase-secret', 'otp-secret', 'discovery-secret', 'pending-secret', 'meta-secret', 'avatar-secret', '+14155551234']) {
    assert.equal(text.includes(secret), false, secret);
  }
  assert.equal(text.includes('body 1'), true);
  assert.equal(text.includes('body 2'), true);
  assert.deepEqual(await store.get('last-account'), { version: CACHE_VERSION, userId: 'A' });
  // The refresh cookie is HttpOnly and never enters JS; even a forged Query field is excluded above.
  await cache.wipe();
  query.clear();
});

test('multiple fetched pages and original cursors restore; uncached older pages remain absent', async () => {
  await resetDatabase();
  const first = client();
  const cache = new OfflineCache(first);
  await cache.activate('A');
  first.setQueryData(messagesKey('A', 'chat'), { pages: [page(1, 'cursor-1'), page(2, 'cursor-2')], pageParams: [undefined, 'cursor-1'] });
  first.setQueryData(listKey('A'), [summary()]);
  await cache.flush();
  const restored = client();
  const offline = new OfflineCache(restored);
  assert.equal(await offline.readOnly(), 'A');
  const history = restored.getQueryData(messagesKey('A', 'chat'));
  assert.equal(history.pages.length, 2);
  assert.deepEqual(history.pageParams, [undefined, 'cursor-1']);
  assert.equal(history.pages[1].nextCursor, 'cursor-2');
  assert.equal(history.pages[2], undefined);
  await cache.wipe();
  first.clear();
  restored.clear();
});

test('history retention keeps ten recent pages and the server cursor for older data', async () => {
  await resetDatabase();
  const query = client();
  const cache = new OfflineCache(query);
  await cache.activate('A');
  query.setQueryData(messagesKey('A', 'chat'), {
    pages: Array.from({ length: 12 }, (_, index) => page(index, `cursor-${index}`)),
    pageParams: Array.from({ length: 12 }, (_, index) => index === 0 ? undefined : `cursor-${index - 1}`),
  });
  await cache.flush();
  const saved = (await new IndexedDbCacheStore().get(key('A'))).state.queries[0].state.data;
  assert.equal(saved.pages.length, MAX_HISTORY_PAGES);
  assert.equal(saved.pageParams.length, MAX_HISTORY_PAGES);
  assert.equal(saved.pages.at(-1).nextCursor, 'cursor-9');
  assert.equal(saved.pages[10], undefined);
  await cache.wipe();
  query.clear();
});

test('account switch waits for an A write, wipes A, then installs only B', async () => {
  await resetDatabase();
  let started;
  let release;
  const entered = new Promise((resolve) => { started = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  class DelayedStore extends IndexedDbCacheStore {
    async put(storageKey, value) {
      if (storageKey === key('A')) { started(); await gate; }
      await super.put(storageKey, value);
    }
  }
  const store = new DelayedStore();
  const query = client();
  const cache = new OfflineCache(query, store);
  await cache.activate('A');
  query.setQueryData(listKey('A'), [summary('Alice private')]);
  await entered;
  const switchAccount = installWithIsolation('A', 'B', async () => {
    await cache.wipe();
    await query.cancelQueries();
    query.clear();
  }, async () => {
    assert.equal(query.getQueryData(listKey('A')), undefined);
    await cache.activate('B');
    query.setQueryData(listKey('B'), [summary('B private')]);
  });
  release();
  await switchAccount;
  await cache.flush();
  assert.equal(await store.get(key('A')), undefined);
  assert.deepEqual(await store.get('last-account'), { version: CACHE_VERSION, userId: 'B' });
  const restarted = client();
  await new OfflineCache(restarted, store).activate('B');
  assert.equal(restarted.getQueryData(listKey('A')), undefined);
  assert.equal(restarted.getQueryData(listKey('B'))[0].peer.name, 'B private');
  await cache.wipe();
  query.clear();
  restarted.clear();
});

test('a second tab marking B does not make A cleanup erase B', async () => {
  await resetDatabase();
  const store = new IndexedDbCacheStore();
  const query = client();
  const cache = new OfflineCache(query, store);
  await cache.activate('A');
  query.setQueryData(listKey('A'), [summary('A private')]);
  await cache.flush();
  await store.put(key('B'), { version: CACHE_VERSION, userId: 'B', savedAt: Date.now(), state: { mutations: [], queries: [] } });
  await store.put('last-account', { version: CACHE_VERSION, userId: 'B' });
  await wipeLocalAccount(cache, query);
  assert.equal(await store.get(key('A')), undefined);
  assert.notEqual(await store.get(key('B')), undefined);
  assert.deepEqual(await store.get('last-account'), { version: CACHE_VERSION, userId: 'B' });
});

test('cached A logout still wipes only A after another tab marks B', async () => {
  await resetDatabase();
  const store = new IndexedDbCacheStore();
  const original = client();
  const first = new OfflineCache(original, store);
  await first.activate('A');
  original.setQueryData(listKey('A'), [summary('A private')]);
  await first.flush();
  const offlineClient = client();
  const offline = new OfflineCache(offlineClient, store);
  assert.equal(await offline.readOnly(), 'A');
  await store.put(key('B'), { version: CACHE_VERSION, userId: 'B', savedAt: Date.now(), state: { mutations: [], queries: [] } });
  await store.put('last-account', { version: CACHE_VERSION, userId: 'B' });
  await wipeLocalAccount(offline, offlineClient, 'A');
  assert.equal(await store.get(key('A')), undefined);
  assert.notEqual(await store.get(key('B')), undefined);
  assert.deepEqual(await store.get('last-account'), { version: CACHE_VERSION, userId: 'B' });
  original.clear();
});

test('an A cached tab never switches its offline view to B through a shared marker', async () => {
  await resetDatabase();
  const store = new IndexedDbCacheStore();
  const original = client();
  const first = new OfflineCache(original, store);
  await first.activate('A');
  original.setQueryData(listKey('A'), [summary('A private')]);
  await first.flush();
  const saved = await store.get(key('A'));
  await store.put(key('B'), { ...saved, userId: 'B', state: { mutations: [], queries: [] } });
  const offlineClient = client();
  const offline = new OfflineCache(offlineClient, store);
  assert.equal(await offline.readOnly(), 'A');
  await store.put('last-account', { version: CACHE_VERSION, userId: 'B' });
  assert.equal(await offline.readOnly(), null);
  assert.equal(offlineClient.getQueryData(listKey('B')), undefined);
  await wipeLocalAccount(offline, offlineClient, 'A');
  original.clear();
});

test('a B snapshot containing an A query cannot hydrate A data', async () => {
  await resetDatabase();
  const store = new IndexedDbCacheStore();
  const query = client();
  const cache = new OfflineCache(query, store);
  await cache.activate('A');
  query.setQueryData(listKey('A'), [summary('A private')]);
  await cache.flush();
  const forged = await store.get(key('A'));
  await store.put(key('B'), { ...forged, userId: 'B' });
  await store.put('last-account', { version: CACHE_VERSION, userId: 'B' });
  const restored = client();
  assert.equal(await new OfflineCache(restored, store).readOnly(), null);
  assert.equal(restored.getQueryData(listKey('A')), undefined);
  assert.equal(restored.getQueryData(listKey('B')), undefined);
  await cache.wipe();
  query.clear();
  restored.clear();
});

for (const action of ['logout', 'account deletion']) {
  test(`${action} wipes the account snapshot and marker`, async () => {
    await resetDatabase();
    const store = new IndexedDbCacheStore();
    const query = client();
    const cache = new OfflineCache(query, store);
    await cache.activate('A');
    query.setQueryData(listKey('A'), [summary()]);
    await cache.flush();
    await wipeLocalAccount(cache, query);
    assert.equal(await store.get(key('A')), undefined);
    assert.equal(await store.get('last-account'), undefined);
    assert.equal(await new OfflineCache(client(), store).readOnly(), null);
  });
}

test('schema mismatch and expired snapshots are discarded safely', async () => {
  await resetDatabase();
  const store = new IndexedDbCacheStore();
  await store.put('last-account', { version: 0, userId: 'A' });
  await store.put('blip-cache:0:A', { obsolete: true });
  assert.equal(await new OfflineCache(client(), store).readOnly(), null);
  assert.equal(await store.get('blip-cache:0:A'), undefined);
  assert.equal(await store.get('last-account'), undefined);
  await store.put('last-account', { version: CACHE_VERSION, userId: 'A' });
  await store.put(key('A'), { version: CACHE_VERSION, userId: 'A', savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000, state: { queries: [], mutations: [] } });
  assert.equal(await new OfflineCache(client(), store).readOnly(), null);
  assert.equal(await store.get(key('A')), undefined);
});

test('quota failure leaves online Query data working', async () => {
  await resetDatabase();
  class QuotaStore extends IndexedDbCacheStore {
    async put(storageKey, value) {
      if (storageKey.startsWith('blip-cache:')) throw new DOMException('quota', 'QuotaExceededError');
      await super.put(storageKey, value);
    }
  }
  const query = client();
  const cache = new OfflineCache(query, new QuotaStore());
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => { warnings.push(message); };
  try {
    await cache.activate('A');
    query.setQueryData(listKey('A'), [summary()]);
    await cache.flush();
    assert.equal(query.getQueryData(listKey('A'))[0].peer.name, 'Bob');
    assert.deepEqual(warnings, ['Offline cache storage unavailable']);
  } finally {
    console.warn = originalWarn;
    await cache.wipe();
    query.clear();
  }
});

test('canonical deleted-peer state removes old peer identity from persisted list and detail', async () => {
  await resetDatabase();
  const store = new IndexedDbCacheStore();
  const query = client();
  const cache = new OfflineCache(query, store);
  await cache.activate('A');
  query.setQueryData(listKey('A'), [summary('Old personal name')]);
  query.setQueryData(detailKey('A', 'chat'), detail('Deleted user', true));
  await cache.flush();
  const stored = await store.get(key('A'));
  assert.equal(JSON.stringify(stored).includes('Old personal name'), false);
  assert.equal(JSON.stringify(stored).includes('Deleted user'), true);
  await cache.wipe();
  query.clear();
});
