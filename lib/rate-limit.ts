interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

function getClientIp(req: Request): string {
  const headers = req.headers;
  const directIp =
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    "unknown";
  return directIp;
}

export function checkRateLimit(
  req: Request,
  bucketName: string,
  limit = 60,
  windowMs = 60_000
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const key = `${bucketName}:${getClientIp(req)}`;
  const now = Date.now();
  const current = store.get(key);

  if (!current || now >= current.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  current.count += 1;
  if (current.count > limit) {
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }

  return { ok: true, remaining: limit - current.count, retryAfterSec: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
}
