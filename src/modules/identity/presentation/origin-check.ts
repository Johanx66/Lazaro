import type { RequestHandler } from "express";

/**
 * Protección anti-CSRF por origen para endpoints públicos que mutan estado.
 * Si el navegador envía Origin, debe estar en la lista permitida. Si no hay Origin,
 * se admite solo cuando Sec-Fetch-Site es same-origin/none o está ausente (clientes
 * no navegador). Combinado con el token de enlace de un solo uso.
 */
export function requireTrustedOrigin(allowedOrigins: string[]): RequestHandler {
  const allowed = new Set(allowedOrigins);
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      if (allowed.has(origin)) {
        next();
        return;
      }
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Origen no permitido" } });
      return;
    }

    const fetchSite = req.headers["sec-fetch-site"];
    if (fetchSite === undefined || fetchSite === "same-origin" || fetchSite === "none") {
      next();
      return;
    }
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Origen no permitido" } });
  };
}
