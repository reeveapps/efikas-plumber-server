import { getConfig } from "./config";

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix ms
}

declare global {
  // eslint-disable-next-line no-var
  var _darajaTokenCache: TokenCache | undefined;
}

export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (global._darajaTokenCache && global._darajaTokenCache.expiresAt - 30_000 > now) {
    return global._darajaTokenCache.accessToken;
  }

  const { baseUrl, consumerKey, consumerSecret } = getConfig();
  const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64");

  const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Daraja OAuth failed (${response.status}): ${text}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: string };
  const expiresIn = parseInt(data.expires_in, 10) * 1000;

  global._darajaTokenCache = {
    accessToken: data.access_token,
    expiresAt: now + expiresIn,
  };

  return data.access_token;
}
