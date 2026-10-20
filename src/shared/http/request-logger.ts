import { randomUUID } from "node:crypto";
import type { Request, RequestHandler, Response } from "express";

export interface RequestLoggerOptions {
  shouldLog?: (req: Request) => boolean;
}

export function requestLogger(options: RequestLoggerOptions = {}): RequestHandler {
  return (req: Request, res: Response, next) => {
    const requestId = randomUUID();
    req.headers["x-request-id"] = requestId;
    res.setHeader("x-request-id", requestId);

    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      if (options.shouldLog && !options.shouldLog(req)) return;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      console.log(
        JSON.stringify({
          level: "info",
          msg: "request",
          requestId,
          method: req.method,
          path: req.originalUrl,
          status: res.statusCode,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    });

    next();
  };
}