import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';

export interface OAuthProfile {
  providerId: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
}

let googleClient: OAuth2Client | undefined;

function getGoogleClient(): OAuth2Client {
  if (!googleClient) googleClient = new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID);
  return googleClient;
}

export async function verifyGoogleIdToken(idToken: string): Promise<OAuthProfile> {
  if (!env.GOOGLE_OAUTH_CLIENT_ID) {
    throw new Error('Google sign-in is not configured (GOOGLE_OAUTH_CLIENT_ID)');
  }
  const ticket = await getGoogleClient().verifyIdToken({
    idToken,
    audience: env.GOOGLE_OAUTH_CLIENT_ID,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error('Invalid Google ID token');
  }
  return {
    providerId: payload.sub,
    email: payload.email,
    name: payload.name,
    avatarUrl: payload.picture,
  };
}

// TODO: wire real Apple sign-in verification. Install `apple-signin-auth` (or
// verify the JWT manually against Apple's JWKS), check aud === APPLE_OAUTH_CLIENT_ID.
export async function verifyAppleIdToken(_idToken: string): Promise<OAuthProfile> {
  if (!env.APPLE_OAUTH_CLIENT_ID) {
    throw new Error('Apple sign-in is not configured (APPLE_OAUTH_CLIENT_ID)');
  }
  throw new Error('Apple sign-in not implemented — install apple-signin-auth and complete verifyAppleIdToken() in src/utils/oauth.ts');
}
