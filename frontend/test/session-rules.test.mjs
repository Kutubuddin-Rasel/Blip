import assert from 'node:assert/strict';
import test from 'node:test';
import { QueryClient } from '@tanstack/react-query';
import { canRetry, installWithIsolation, retryForSameAccount, sessionEventAction, singleFlight } from '../src/lib/session-rules.ts';

test('one same-tab refresh serves concurrent expired requests and resets after settlement', async () => {
  let calls = 0;
  let release;
  const refresh = singleFlight(async () => {
    calls += 1;
    await new Promise((resolve) => { release = resolve; });
    return 'fresh';
  }, () => 0);
  const first = refresh();
  const second = refresh();
  await Promise.resolve();
  assert.equal(calls, 1);
  release();
  assert.deepEqual(await Promise.all([first, second]), ['fresh', 'fresh']);
  const third = refresh();
  await Promise.resolve();
  assert.equal(calls, 2);
  release();
  assert.equal(await third, 'fresh');
});

test('account change starts a new refresh and prevents an old response from driving the new session', async () => {
  let generation = 0;
  let releaseOld;
  const refresh = singleFlight(async (captured) => {
    if (captured === 0) await new Promise((resolve) => { releaseOld = resolve; });
    return captured;
  }, () => generation);
  const old = refresh();
  await Promise.resolve();
  generation = 1;
  assert.equal(await refresh(), 1);
  releaseOld();
  assert.equal(await old, 0);
});

test('A request retries exactly once with A and never with B', async () => {
  let retryCount = 0;
  const retried = await retryForSameAccount('A', () => 'A', async () => ({ user: { id: 'A' }, accessToken: 'new' }), async (token) => {
    retryCount += 1;
    assert.equal(token, 'new');
    return 'ok';
  });
  assert.equal(retried, 'ok');
  assert.equal(retryCount, 1);
  assert.equal(canRetry('A', 'A', 'B'), false);
  await assert.rejects(retryForSameAccount('A', () => 'A', async () => ({ user: { id: 'B' }, accessToken: 'B-token' }), async () => {
    retryCount += 1;
  }), /Session changed/);
  assert.equal(retryCount, 1);
});

test('a request already detached from A does not even attempt refresh', async () => {
  let refreshCalls = 0;
  await assert.rejects(retryForSameAccount('A', () => 'B', async () => { refreshCalls += 1; return { user: { id: 'B' }, accessToken: 'token' }; }, async () => {}), /Session changed/);
  assert.equal(refreshCalls, 0);
});

test('refresh failure does not invoke a retry or a recursive refresh', async () => {
  let refreshCalls = 0;
  let retries = 0;
  await assert.rejects(retryForSameAccount('A', () => 'A', async () => { refreshCalls += 1; throw new Error('refresh failed'); }, async () => { retries += 1; }), /refresh failed/);
  assert.equal(refreshCalls, 1);
  assert.equal(retries, 0);
});

test('cross-tab notifications carry lifecycle instructions only', () => {
  assert.equal(sessionEventAction('session.ended'), 'end');
  assert.equal(sessionEventAction('session.changed', 'B'), 'rebootstrap');
  assert.equal(sessionEventAction('session.established', 'A'), 'rebootstrap');
  assert.equal(sessionEventAction('session.changed', null), 'ignore');
});

test('account replacement clears old Query state before B is installed', async () => {
  const queryClient = new QueryClient();
  queryClient.setQueryData(['account', 'A', 'conversations'], ['private A data']);
  const events = [];
  await installWithIsolation('A', 'B', async () => {
    await queryClient.cancelQueries();
    events.push('cancel queries');
    queryClient.clear();
    events.push('clear cache');
  }, () => {
    assert.equal(queryClient.getQueryData(['account', 'A', 'conversations']), undefined);
    events.push('install B');
    queryClient.setQueryData(['account', 'B', 'conversations'], ['B data']);
  });
  assert.deepEqual(events, ['cancel queries', 'clear cache', 'install B']);
  assert.deepEqual(queryClient.getQueryData(['account', 'B', 'conversations']), ['B data']);
});
