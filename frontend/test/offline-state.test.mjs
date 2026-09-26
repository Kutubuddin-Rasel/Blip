import assert from 'node:assert/strict';
import test from 'node:test';
import { selectVisibleAccountId, useAuthStore } from '../src/store/useAuthStore.ts';

test('cached data is explicitly read-only state with no authenticated user or token', () => {
  useAuthStore.getState().cached('A');
  const cached = useAuthStore.getState();
  assert.equal(cached.status, 'cached');
  assert.equal(cached.user, null);
  assert.equal(cached.token, null);
  assert.equal(selectVisibleAccountId(cached), 'A');
  cached.beginBootstrap();
  assert.equal(selectVisibleAccountId(useAuthStore.getState()), null);
  useAuthStore.getState().unauthenticated();
  assert.equal(useAuthStore.getState().status, 'unauthenticated');
});

test('only a verified session installs authenticated identity', () => {
  useAuthStore.getState().cached('A');
  useAuthStore.getState().authenticated({ id: 'B', name: 'Bob', phoneNumber: '+14155551234', avatar: null }, 'access-token');
  const verified = useAuthStore.getState();
  assert.equal(verified.status, 'authenticated');
  assert.equal(verified.offlineAccountId, null);
  assert.equal(selectVisibleAccountId(verified), 'B');
  verified.unauthenticated();
  assert.equal(selectVisibleAccountId(useAuthStore.getState()), null);
});
