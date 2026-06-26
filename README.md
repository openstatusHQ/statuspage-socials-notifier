# statuspage-socials-notifier

A tiny, self-hosted [Hono](https://hono.dev) app that listens to an
[openstatus](https://openstatus.dev) status-page webhook and posts incident /
maintenance updates to your socials — **Bluesky, X** out of the box,
and trivially extendable to more.

You host it. There's no shared API and no OAuth dance to opt into: you drop your
own platform credentials into env vars, point an openstatus webhook at it, and
it posts on your behalf.

## How it works

```
openstatus status report/update ──webhook──▶ /webhook ──▶ enabled providers
```

1. openstatus sends a versioned JSON payload (`version: "1"`) on every status
   report update and maintenance event.
2. The app validates it, optionally filters by status, renders one post, and
   fans out to every **configured** provider (a provider is "configured" iff its
   env vars are set).
3. It **always responds `200`** with a per-provider result body — posting is
   best-effort and openstatus does not retry.

openstatus **`test`** webhooks (the "Send test" button) only verify reachability and auth — they're acknowledged with `200` but **never broadcast** to Bluesky or X.

The whole thing is two files: the route + payload schema in
[`src/index.ts`](./src/index.ts) and the providers in
[`src/providers.ts`](./src/providers.ts).

## Quick start

```sh
pnpm install
cp .env.example .env   # fill in a token + at least one platform
pnpm dev               # http://localhost:3000
```

Then in openstatus, add a **webhook subscriber** to your status page pointing at
`https://<your-host>/webhook`, with a custom header:

```
Authorization: Bearer <OPENSTATUS_WEBHOOK_TOKEN>
```

## Docker

```sh
docker build -t statuspage-socials-notifier .
docker run -p 3000:3000 --env-file .env statuspage-socials-notifier
```

## Deploy

The app runs as a long-lived Node server (`src/index.ts`) **and** as a Vercel
serverless function (`api/index.ts`) — both share the same Hono `app`; the Node
listener is skipped when `process.env.VERCEL` is set. Set at least
`OPENSTATUS_WEBHOOK_TOKEN` plus one platform's credentials (see
[`.env.example`](./.env.example)) on whichever host you pick, then point the
openstatus webhook at `https://<your-host>/webhook`.

### Fly.io

Config in [`fly.toml`](./fly.toml) (Dockerfile build, port 3000, scale-to-zero).
Edit the `app =` name first if it's taken.

```sh
fly launch --copy-config --no-deploy
fly secrets set OPENSTATUS_WEBHOOK_TOKEN=… BLUESKY_IDENTIFIER=… BLUESKY_APP_PASSWORD=… \
  X_API_KEY=… X_API_SECRET=… X_ACCESS_TOKEN=… X_ACCESS_SECRET=…
fly deploy
```

→ `https://<app>.fly.dev/webhook`

### Railway

Connect the repo (or `railway up`). It auto-detects the Dockerfile via
[`railway.json`](./railway.json). Add the env vars in the dashboard, then
generate a domain.

→ `https://<app>.up.railway.app/webhook`

### Vercel

Routing lives in [`vercel.json`](./vercel.json) (every path → the function).

```sh
vercel                                   # link/create the project
vercel env add OPENSTATUS_WEBHOOK_TOKEN  # repeat per secret, or use the dashboard
vercel --prod
```

→ `https://<app>.vercel.app/webhook`

> **Scale-to-zero (Fly + Vercel):** the first webhook after an idle period
> cold-starts (~1–2s). openstatus doesn't retry and the app always returns
> `200`, so the only effect is a slightly slower first post.

## Configuration

See [`.env.example`](./.env.example).

| Var | Purpose |
| --- | --- |
| `OPENSTATUS_WEBHOOK_TOKEN` | Shared bearer token verified on every request. |
| `PORT` | Listen port (default `3000`). |
| `POST_ON_STATUSES` | Comma list (e.g. `investigating,resolved`); default = all. |
| `POST_MAINTENANCE` | `false` to skip scheduled-maintenance posts. |

### Platform credentials

- **Bluesky** — `BLUESKY_IDENTIFIER` + `BLUESKY_APP_PASSWORD` (App Password).
- **X** — OAuth 1.0a user context (app with Read+Write): `X_API_KEY`,
  `X_API_SECRET`, `X_ACCESS_TOKEN`, `X_ACCESS_SECRET`.

A platform with missing vars is silently skipped.

## Adding a platform

Implement `SocialProvider` (`id`, `maxLength`, `isConfigured(env)`,
`post(text, env)`) in [`src/providers.ts`](./src/providers.ts) and append it to
the `providers` array. That's it — no other wiring.
