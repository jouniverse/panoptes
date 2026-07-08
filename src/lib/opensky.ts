import { fetchJSON } from "./http";

const TOKEN_URL =
  "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";

let cachedToken: { token: string; expiresAt: number } | null = null;

/** OAuth2 client-credentials token for OpenSky (cached until ~1 min before expiry). */
export async function getOpenSkyToken(): Promise<string | null> {
  const id = process.env.OPENSKY_CLIENT_ID;
  const secret = process.env.OPENSKY_CLIENT_SECRET;
  if (!id || !secret) return null;

  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: id,
    client_secret: secret,
  });

  const json = await fetchJSON<{ access_token?: string; expires_in?: number }>(
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    },
    12_000,
  );

  if (!json.access_token) return null;
  const ttl = (json.expires_in ?? 1800) * 1000;
  cachedToken = { token: json.access_token, expiresAt: Date.now() + ttl - 60_000 };
  return json.access_token;
}
