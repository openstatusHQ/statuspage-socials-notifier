import { describe, expect, it } from "vitest";

import { bluesky, configuredProviders, x } from "./providers.js";

describe("provider configuration", () => {
  it("bluesky is configured only when both identifier and app password are set", () => {
    expect(bluesky.isConfigured({})).toBe(false);
    expect(bluesky.isConfigured({ BLUESKY_IDENTIFIER: "me.bsky.social" })).toBe(false);
    expect(
      bluesky.isConfigured({
        BLUESKY_IDENTIFIER: "me.bsky.social",
        BLUESKY_APP_PASSWORD: "secret",
      }),
    ).toBe(true);
  });

  it("x is configured only when all four oauth credentials are set", () => {
    expect(x.isConfigured({})).toBe(false);
    expect(
      x.isConfigured({ X_API_KEY: "a", X_API_SECRET: "b", X_ACCESS_TOKEN: "c" }),
    ).toBe(false);
    expect(
      x.isConfigured({
        X_API_KEY: "a",
        X_API_SECRET: "b",
        X_ACCESS_TOKEN: "c",
        X_ACCESS_SECRET: "d",
      }),
    ).toBe(true);
  });

  it("configuredProviders returns only the platforms with env present", () => {
    expect(configuredProviders({}).map((p) => p.id)).toEqual([]);
    expect(
      configuredProviders({
        BLUESKY_IDENTIFIER: "me.bsky.social",
        BLUESKY_APP_PASSWORD: "secret",
      }).map((p) => p.id),
    ).toEqual(["bluesky"]);
    expect(
      configuredProviders({
        BLUESKY_IDENTIFIER: "me.bsky.social",
        BLUESKY_APP_PASSWORD: "secret",
        X_API_KEY: "a",
        X_API_SECRET: "b",
        X_ACCESS_TOKEN: "c",
        X_ACCESS_SECRET: "d",
      }).map((p) => p.id),
    ).toEqual(["bluesky", "x"]);
  });

  it("respects the platform character limits", () => {
    expect(bluesky.maxLength).toBe(300);
    expect(x.maxLength).toBe(280);
  });
});
