type Labels = Record<string, string>;

interface RequestLike { method?: string; originalUrl?: string; url?: string }
interface ResponseLike { statusCode: number; once(event: 'finish', listener: () => void): void }

function labelText(labels: Labels): string {
  return Object.entries(labels).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}` + '"').join(',');
}

function routeLabel(url: string): string {
  const path = new URL(url, 'http://localhost').pathname;
  if (path === '/api/v1/health/live' || path === '/api/v1/health/ready' || path === '/metrics') return path;
  if (/^\/api\/v1\/auth\/(csrf|login|logout|me)$/.test(path)) return path;
  if (/^\/api\/v1\/projects\/[^/]+\/(releases|deployments|rollbacks)$/.test(path)) return '/api/v1/projects/:id/' + path.split('/').at(-1);
  if (/^\/api\/v1\/projects\/[^/]+$/.test(path)) return '/api/v1/projects/:id';
  if (/^\/api\/v1\/deployments\/[^/]+$/.test(path)) return '/api/v1/deployments/:id';
  if (path === '/api/v1/projects') return path;
  return 'unmatched';
}

export class HttpMetrics {
  private readonly requests = new Map<string, number>();
  private readonly errors = new Map<string, number>();
  private readonly durationCount = new Map<string, number>();
  private readonly durationSum = new Map<string, number>();

  constructor(private readonly service: string) {}

  middleware() {
    return (request: RequestLike, response: ResponseLike, next: () => void): void => {
      const path = request.originalUrl ?? request.url ?? '/';
      if (path.split('?')[0] === '/metrics') {
        next();
        return;
      }
      const started = performance.now();
      response.once('finish', () => {
        const labels = { method: request.method ?? 'UNKNOWN', route: routeLabel(path), service: this.service, status_code: String(response.statusCode) };
        const key = labelText(labels);
        this.requests.set(key, (this.requests.get(key) ?? 0) + 1);
        if (response.statusCode >= 500) this.errors.set(key, (this.errors.get(key) ?? 0) + 1);
        this.durationCount.set(key, (this.durationCount.get(key) ?? 0) + 1);
        this.durationSum.set(key, (this.durationSum.get(key) ?? 0) + ((performance.now() - started) / 1000));
      });
      next();
    };
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
