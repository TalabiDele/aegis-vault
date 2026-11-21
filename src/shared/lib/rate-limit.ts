interface WindowRecord {
  timestamps: number[];
}

const buckets = new Map<string, WindowRecord>();
const MAX_BUCKETS = 10_000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAtMs: number;
}

/**
 * In-memory sliding-window rate limiter keyed by client identifier (IP + route).
 */
export function checkRateLimit(
  key: string,
  limit = 120,
  windowMs = 60_000
): RateLimitResult {
  const now = Date.now();
  const cutoff = now - windowMs;

  if (buckets.size > MAX_BUCKETS) {
    for (const [k, record] of buckets.entries()) {
      const latest = record.timestamps[record.timestamps.length - 1];
      if (latest === undefined || latest < cutoff) {
        buckets.delete(k);
      }
    }
  }

  const record = buckets.get(key) ?? { timestamps: [] };
  const active = record.timestamps.filter((ts) => ts > cutoff);

  if (active.length >= limit) {
    const oldest = active[0] ?? now;
    buckets.set(key, { timestamps: active });
    return {
      allowed: false,
      remaining: 0,
      resetAtMs: oldest + windowMs,
    };
  }

  active.push(now);
  buckets.set(key, { timestamps: active });

  return {
    allowed: true,
    remaining: Math.max(0, limit - active.length),
    resetAtMs: now + windowMs,
  };
}

export function extractClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  return headers.get("x-real-ip")?.trim() || "127.0.0.1";
}
