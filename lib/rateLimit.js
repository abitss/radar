import crypto from 'node:crypto';
import { query } from './db.js';

export async function rateLimit(key, { limit = 20, windowSeconds = 60 } = {}) {
  const safeKey = crypto.createHash('sha256').update(String(key)).digest('hex');

  const result = await query(`
    INSERT INTO rate_limits (key,count,window_start)
    VALUES ($1,1,now())
    ON CONFLICT(key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval
        THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - ($2 || ' seconds')::interval
        THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count,window_start
  `, [safeKey, String(windowSeconds)]);

  const count = result.rows[0].count;

  if (count > limit) {
    throw new Error('Too many requests. Please wait and try again.');
  }
}

export function requestIp(request) {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}
