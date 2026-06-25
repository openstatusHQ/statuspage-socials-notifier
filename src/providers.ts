import { AtpAgent, RichText } from "@atproto/api";
import { TwitterApi } from "twitter-api-v2";

type Env = Record<string, string | undefined>;

/**
 * A social platform. To add one: implement this and push it into `providers`.
 * `isConfigured` keys off env so unconfigured platforms are silently skipped.
 */
export interface SocialProvider {
  id: string;
  /** Max post length; text is truncated to this before `post`. */
  maxLength: number;
  isConfigured(env: Env): boolean;
  post(text: string, env: Env): Promise<void>;
}

/**
 * Bluesky via the official @atproto/api SDK. Auth: an app password
 * (Settings → Privacy and Security → App Passwords), not your login.
 *
 * RichText.detectFacets resolves links, @mentions, and #hashtags into facets
 * so they render as clickable — plain text alone leaves them inert. It also
 * handles the utf16↔utf8 byte-offset math the facet format requires.
 */
export const bluesky: SocialProvider = {
  id: "bluesky",
  maxLength: 300,
  isConfigured: (env) => Boolean(env.BLUESKY_IDENTIFIER && env.BLUESKY_APP_PASSWORD),
  async post(text, env) {
    const agent = new AtpAgent({ service: env.BLUESKY_SERVICE ?? "https://bsky.social" });
    await agent.login({
      identifier: env.BLUESKY_IDENTIFIER!,
      password: env.BLUESKY_APP_PASSWORD!,
    });

    const rt = new RichText({ text });
    await rt.detectFacets(agent); // resolves links / mentions / hashtags

    await agent.post({
      text: rt.text,
      facets: rt.facets,
      createdAt: new Date().toISOString(),
    });
  },
};

/**
 * X (Twitter) via twitter-api-v2 (POST /2/tweets). Writing a tweet needs an
 * OAuth 1.0a user context — a plain app bearer token can't post. Create the
 * four credentials in the X developer portal (app with Read+Write):
 * X_API_KEY / X_API_SECRET (consumer keys) and X_ACCESS_TOKEN /
 * X_ACCESS_SECRET (the access token + secret for the posting account).
 */
export const x: SocialProvider = {
  id: "x",
  maxLength: 280,
  isConfigured: (env) =>
    Boolean(env.X_API_KEY && env.X_API_SECRET && env.X_ACCESS_TOKEN && env.X_ACCESS_SECRET),
  async post(text, env) {
    const client = new TwitterApi({
      appKey: env.X_API_KEY!,
      appSecret: env.X_API_SECRET!,
      accessToken: env.X_ACCESS_TOKEN!,
      accessSecret: env.X_ACCESS_SECRET!,
    });
    await client.v2.tweet(text);
  },
};

/** Add a platform by appending it here. */
export const providers: SocialProvider[] = [bluesky, x];

export function configuredProviders(env: Env): SocialProvider[] {
  return providers.filter((p) => p.isConfigured(env));
}
