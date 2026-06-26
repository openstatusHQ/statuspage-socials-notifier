// Vercel serverless entrypoint. Reuses the same Hono app as the Node server;
// importing it here is side-effect-free because index.ts skips serve() when
// process.env.VERCEL is set. vercel.json rewrites every path to this function.
//
// We do NOT use @hono/node-server/vercel's handle() here: Vercel's Node runtime
// buffers and parses the request body before invoking us (exposing it as
// req.body), which leaves the raw IncomingMessage stream drained. That adapter
// then re-reads the stream via Readable.toWeb(), so `await c.req.json()` waits
// on a stream that never emits "end" and the function hangs until the 5-minute
// wall (FUNCTION_INVOCATION_TIMEOUT). Instead we rebuild a web-standard Request
// from the already-parsed body and hand it to app.fetch directly.
import type { IncomingMessage, ServerResponse } from "node:http";

import { app } from "../src/index.js";

export const config = { runtime: "nodejs" };

type VercelRequest = IncomingMessage & { body?: unknown };

export default async function handler(req: VercelRequest, res: ServerResponse) {
  const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const host = req.headers.host ?? "localhost";
  const url = new URL(req.url ?? "/", `${proto}://${host}`);

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
    else if (value != null) headers.set(key, value);
  }

  // Reconstruct the body from Vercel's parsed req.body (the raw stream is
  // already consumed). GET/HEAD never carry one.
  let body: string | undefined;
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    const parsed = req.body;
    if (parsed == null) body = undefined;
    else if (typeof parsed === "string") body = parsed;
    else if (Buffer.isBuffer(parsed)) body = parsed.toString("utf8");
    else body = JSON.stringify(parsed);
  }

  const response = await app.fetch(new Request(url, { method: req.method, headers, body }));

  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
}
