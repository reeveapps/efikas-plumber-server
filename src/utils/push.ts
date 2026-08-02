import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type SendResponse } from 'firebase-admin/messaging';
import { env } from '../config/env.js';

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

let app: App | null = null;

function getApp(): App | null {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return null;
  if (app) return app;
  app = initializeApp({
    credential: cert({
      projectId: env.FIREBASE_PROJECT_ID,
      clientEmail: env.FIREBASE_CLIENT_EMAIL,
      privateKey: env.FIREBASE_PRIVATE_KEY,
    }),
  });
  return app;
}

export async function sendPush(tokens: string[], payload: PushPayload): Promise<void> {
  if (tokens.length === 0) return;

  const firebaseApp = getApp();
  if (!firebaseApp) {
    if (env.NODE_ENV !== 'production') {
      console.log(`[PUSH:dev] tokens=${tokens.length} title="${payload.title}" body="${payload.body}"`);
      return;
    }
    throw new Error('Firebase Cloud Messaging is not configured (FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY)');
  }

  const response = await getMessaging(firebaseApp).sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: payload.data,
  });

  response.responses.forEach((res: SendResponse, i: number) => {
    if (!res.success) {
      console.error(`[PUSH] token ${tokens[i].slice(0, 12)}... failed: ${res.error?.code} — ${res.error?.message}`);
    }
  });

  // Prune tokens FCM reports as dead (uninstalled app, expired token) so we
  // stop retrying them on every future message.
  const staleTokens = response.responses
    .map((res: SendResponse, i: number) => (!res.success && isUnregisteredError(res.error?.code) ? tokens[i] : null))
    .filter((t): t is string => t !== null);
  if (staleTokens.length > 0) {
    const { prisma } = await import('../db/index.js');
    await prisma.deviceToken.deleteMany({ where: { fcmToken: { in: staleTokens } } });
  }
}

function isUnregisteredError(code: string | undefined): boolean {
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}
