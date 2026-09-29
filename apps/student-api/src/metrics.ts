type Labels = Record<string, string>;

function labelText(labels: Labels): string {
  return Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}` + '"').join(',');
}

export class HttpMetrics {
  private readonly requests = new Map<string, number>();
  private readonly errors = new Map<string, number>();
  private readonly durationCount = new Map<string, number>();
  private readonly durationSum = new Map<string, number>();

  constructor(private readonly service: string) {}

  observe(method: string, route: string, statusCode: number, durationMs: number): void {
    const labels = labelText({ method, route, service: this.service, status_code: String(statusCode) });
    this.requests.set(labels, (this.requests.get(labels) ?? 0) + 1);
    if (statusCode >= 500) this.errors.set(labels, (this.errors.get(labels) ?? 0) + 1);
    this.durationCount.set(labels, (this.durationCount.get(labels) ?? 0) + 1);
    this.durationSum.set(labels, (this.durationSum.get(labels) ?? 0) + durationMs / 1000);
  }

  render(): string {
    const lines = [
      '# HELP devdeploy_http_requests_total Total HTTP responses served.',
      '# TYPE devdeploy_http_requests_total counter',
      ...[...this.requests].map(([labels, value]) => `devdeploy_http_requests_total{${labels}} ${value}`),
      '# HELP devdeploy_http_errors_total Total HTTP 5xx responses served.',
      '# TYPE devdeploy_http_errors_total counter',
      ...[...this.errors].map(([labels, value]) => `devdeploy_http_errors_total{${labels}} ${value}`),
      '# HELP devdeploy_http_request_duration_seconds Request duration in seconds.',
      '# TYPE devdeploy_http_request_duration_seconds summary',
      ...[...this.durationCount].flatMap(([labels, value]) => [
        `devdeploy_http_request_duration_seconds_count{${labels}} ${value}`,
        `devdeploy_http_request_duration_seconds_sum{${labels}} ${(this.durationSum.get(labels) ?? 0).toFixed(6)}`,
      ]),
    ];
    return `${lines.join('\n')}\n`;
  }
}
