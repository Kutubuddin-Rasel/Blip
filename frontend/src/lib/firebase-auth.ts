import type { FirebaseApp } from "firebase/app";
import { inMemoryPersistence, initializeAuth } from "firebase/auth";

export function initializeProofAuth(
  app: FirebaseApp,
  initialize: typeof initializeAuth = initializeAuth,
) {
  return initialize(app, { persistence: inMemoryPersistence });
}
