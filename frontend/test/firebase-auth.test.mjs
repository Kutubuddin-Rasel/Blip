import assert from 'node:assert/strict';
import test from 'node:test';
import { inMemoryPersistence } from 'firebase/auth';
import { initializeProofAuth } from '../src/lib/firebase-auth.ts';

test('Firebase Auth selects in-memory persistence when initialized for phone proof', () => {
  const app = { name: 'test-app' };
  const configuredAuth = { name: 'ephemeral-auth' };
  let calls = 0;
  const result = initializeProofAuth(app, (receivedApp, dependencies) => {
    calls += 1;
    assert.equal(receivedApp, app);
    assert.equal(dependencies.persistence, inMemoryPersistence);
    assert.equal(dependencies.persistence.type, 'NONE');
    return configuredAuth;
  });
  assert.equal(result, configuredAuth);
  assert.equal(calls, 1);
});
