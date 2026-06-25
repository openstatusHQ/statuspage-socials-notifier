// Vercel serverless entrypoint. Reuses the same Hono app as the Node server;
// importing it here is side-effect-free because index.ts skips serve() when
// process.env.VERCEL is set. vercel.json rewrites every path to this function.
import { handle } from "hono/vercel";

import { app } from "../src/index";

export const config = { runtime: "nodejs" };

export default handle(app);
