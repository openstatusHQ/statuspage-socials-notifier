// Vercel serverless entrypoint. Reuses the same Hono app as the Node server;
// importing it here is side-effect-free because index.ts skips serve() when
// process.env.VERCEL is set. vercel.json rewrites every path to this function.
//
// Use @hono/node-server's adapter (not hono/vercel): with `runtime: "nodejs"`
// Vercel invokes us with Node's (req, res), which this handle() bridges to the
// app. hono/vercel's handle expects a web-standard Request (the Edge runtime
// contract) and crashes on a Node IncomingMessage.
import { handle } from "@hono/node-server/vercel";

import { app } from "../src/index.js";

export const config = { runtime: "nodejs" };

export default handle(app);
