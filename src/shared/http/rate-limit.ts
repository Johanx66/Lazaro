import type { Request, RequestHandler, Response } from "express";

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  message?: string;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

export function rateLimit(config: RateLimitConfig): RequestHandler {
  const windowMs = config.windowMs;
  const max = config.max;
  const message = config.message ?? "Demasiadas solicitudes";

  const hits = new Map<string, WindowEntry>();

  const cleanup = (): void => {
    const now = Date.now();
    for (const [key, entry] of hits) {
      if (entry.resetAt <= now) hits.delete(key);
    }
  };
  setInterval(cleanup, windowMs).unref();

  return (req: Request, res: Response, next) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();
    const entry = hits.get(ip);

    if (!entry || entry.resetAt <= now) {
      hits.set(ip, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    entry.count += 1;
    if (entry.count > max) {
      res.status(429).json({ error: { code: "TOO_MANY_REQUESTS", message } });
      return;
    }
    next();
  };
}