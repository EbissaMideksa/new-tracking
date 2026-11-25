// lib/metrics.ts
//
// No Prometheus in this edition. The registry shim keeps the /api/metrics route
// and instrumentation imports working, returning a minimal text payload.

export const registry = {
  async metrics(): Promise<string> {
    return [
      "# HELP app_info Application build info",
      "# TYPE app_info gauge",
      `app_info{version="${process.env.npm_package_version || "0.1.0"}"} 1`,
      "",
    ].join("\n")
  },
  get contentType(): string {
    return "text/plain; version=0.0.4; charset=utf-8"
  },
}