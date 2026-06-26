const page = {
  id: 1,
  name: "Acme Status",
  slug: "acme",
  url: "https://status.acme.com",
};

const subscription = { manage_url: null, unsubscribe_url: null };

/** A valid `status_report` payload; override the update status if needed. */
export function statusReport(overrides: { status?: string } = {}): unknown {
  return {
    version: "1",
    type: "status_report",
    data: {
      status_report: {
        id: 10,
        title: "API errors",
        url: "https://status.acme.com/reports/10",
        update: {
          id: 100,
          status: overrides.status ?? "investigating",
          message: "We are looking into elevated error rates.",
          occurred_at: "2026-06-25T12:00:00.000Z",
        },
        page,
        components: [{ id: 1, name: "API", impact: "major_outage" }],
      },
    },
    subscription,
  };
}

/** A valid `test` (connectivity-check) payload. Carries no subscription. */
export function test(overrides: { timestamp?: string } = {}): unknown {
  return {
    version: "1",
    type: "test",
    data: {
      test: {
        message: "This is a test webhook from openstatus.",
        timestamp: overrides.timestamp ?? "2026-06-25T12:00:00.000Z",
      },
    },
  };
}

/** A valid `maintenance` payload. */
export function maintenance(overrides: { starts_at?: string; ends_at?: string } = {}): unknown {
  return {
    version: "1",
    type: "maintenance",
    data: {
      maintenance: {
        id: 20,
        title: "Database upgrade",
        url: "https://status.acme.com/maintenances/20",
        message: "We will upgrade the primary database.",
        starts_at: overrides.starts_at,
        ends_at: overrides.ends_at,
        page,
        components: [],
      },
    },
    subscription,
  };
}
