import { describe, expect, it } from "vitest";

import { renderPost, truncate } from "./index.js";
import { webhookPayloadSchema } from "./schema.js";
import { maintenance, statusReport } from "./fixtures.js";

function parse(raw: unknown) {
  const parsed = webhookPayloadSchema.parse(raw);
  return parsed;
}

describe("renderPost", () => {
  it("renders a status_report with a status emoji label, title and url", () => {
    const text = renderPost(parse(statusReport()));
    expect(text).toContain("🔴 Investigating: API errors");
    expect(text).toContain("https://status.acme.com");
    expect(text).toContain("We are looking into elevated error rates.");
  });

  it("uses the matching label per status", () => {
    expect(renderPost(parse(statusReport({ status: "resolved" })))).toContain("🟢 Resolved");
    expect(renderPost(parse(statusReport({ status: "monitoring" })))).toContain("🟡 Monitoring");
    expect(renderPost(parse(statusReport({ status: "identified" })))).toContain("🟠 Identified");
  });

  it("renders a maintenance payload with a window when both timestamps are present", () => {
    const text = renderPost(
      parse(
        maintenance({
          starts_at: "2026-07-01T00:00:00.000Z",
          ends_at: "2026-07-01T02:00:00.000Z",
        }),
      ),
    );
    expect(text).toContain("🛠 Scheduled maintenance: Database upgrade");
    expect(text).toContain("🗓");
    expect(text).toContain("→");
    expect(text).toContain("https://status.acme.com");
  });

  it("omits the window line when timestamps are missing", () => {
    const text = renderPost(parse(maintenance()));
    expect(text).not.toContain("🗓");
    // No empty lines left behind by the filter(Boolean).
    expect(text.split("\n")).not.toContain("");
  });
});

describe("truncate", () => {
  it("returns text unchanged when within budget", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and appends an ellipsis when over budget", () => {
    const out = truncate("abcdefghij", 5);
    expect(Array.from(out).length).toBeLessThanOrEqual(5);
    expect(out.endsWith("…")).toBe(true);
  });

  it("keeps a trailing url intact and truncates the body", () => {
    const url = "https://status.acme.com";
    const text = `A very long status message that will not fit at all\n${url}`;
    const out = truncate(text, 40);
    expect(out.endsWith(url)).toBe(true);
    expect(Array.from(out).length).toBeLessThanOrEqual(40);
    expect(out).toContain("…");
  });

  it("never splits a surrogate pair (counts by code points)", () => {
    // Each 👍 is one code point but two UTF-16 units.
    const text = "👍👍👍👍👍";
    const out = truncate(text, 3);
    // Array.from splits by code point, so length is exact and no � appears.
    expect(Array.from(out)).not.toContain("�");
    expect(Array.from(out).length).toBeLessThanOrEqual(3);
  });

  it("treats a non-url last line as part of the body", () => {
    const text = "line one\nline two not a link";
    const out = truncate(text, 12);
    expect(out.endsWith("…")).toBe(true);
    expect(Array.from(out).length).toBeLessThanOrEqual(12);
  });
});
