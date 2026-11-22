import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';

/**
 * Small in-memory limit per IP address for public forms (TIQ-34): at most
 * `max` requests in `windowMs`. Enough for one server; it resets on restart.
 */
export function rateLimit({ max, windowMs }: { max: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = req.ip ?? 'unknown';
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      throw new AppError(429, 'TOO_MANY_REQUESTS', 'Too many requests. Please try again later');
    }
    recent.push(now);
    hits.set(key, recent);
    // Forget quiet addresses now and then, so the map stays small.
    if (hits.size > 10_000) {
      for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
    next();
  };
}
