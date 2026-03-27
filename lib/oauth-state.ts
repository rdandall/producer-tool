import { getSetting, setSetting, deleteSetting } from "@/lib/db/settings";

const DEFAULT_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OauthStateRecord {
  state: string;
  expiresAt: number;
}

const randomState = () => crypto.randomUUID();

export async function createOauthState(provider: string): Promise<string> {
  const state = randomState();
  const record: OauthStateRecord = {
    state,
    expiresAt: Date.now() + DEFAULT_OAUTH_STATE_TTL_MS,
  };
  await setSetting(`oauth_state_${provider}`, JSON.stringify(record));
  return state;
}

export async function consumeOauthState(provider: string, state: string | null): Promise<boolean> {
  const raw = await getSetting(`oauth_state_${provider}`);
  await deleteSetting(`oauth_state_${provider}`);
  if (!state || !raw) return false;

  try {
    const parsed = JSON.parse(raw) as OauthStateRecord;
    if (!parsed?.state || parsed.state !== state) return false;
    if (!parsed.expiresAt || Date.now() > parsed.expiresAt) return false;
    return true;
  } catch {
    return false;
  }
}
