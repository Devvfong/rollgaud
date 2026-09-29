import { createServer, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';

import { HttpMetrics } from './metrics.js';

export interface StudentApiConfig {
  commitSha: string;
  version: string;
}

const commitShaPattern = /^[a-f0-9]{40}$/i;

export function readStudentApiConfig(environment: NodeJS.ProcessEnv = process.env): StudentApiConfig {
  const commitSha = environment.COMMIT_SHA;
  const version = environment.APP_VERSION;

  if (typeof commitSha !== 'string' || !commitShaPattern.test(commitSha)) {
    throw new TypeError('COMMIT_SHA must be a 40-character hexadecimal Git SHA');
  }
  if (typeof version !== 'string' || version.length === 0) {
    throw new TypeError('APP_VERSION must be a non-empty string');
  }

  return { commitSha, version };
}

function writeJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

function writeMetrics(response: ServerResponse, metrics: HttpMetrics): void {
  response.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' });
  response.end(metrics.render());
}

export function createStudentApi(environment: NodeJS.ProcessEnv = process.env): Server {
  const config = readStudentApiConfig(environment);
  const metrics = new HttpMetrics('student-api');

  return createServer((request, response) => {
    const started = performance.now();
    response.once('finish', () => metrics.observe(request.method ?? 'UNKNOWN', request.url?.split('?')[0] ?? '/', response.statusCode, performance.now() - started));
    if (request.method === 'GET' && request.url === '/metrics') {
      writeMetrics(response, metrics);
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      writeJson(response, 200, { status: 'ok' });
      return;
    }

    if (request.method === 'GET' && request.url === '/version') {
      writeJson(response, 200, config);
      return;
    }

    writeJson(response, 404, { code: 'not_found' });
  });
}

function isEntrypoint(): boolean {
  return process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url;
}

if (isEntrypoint()) {
  const port = Number.parseInt(process.env.PORT ?? '3000', 10);
  const server = createStudentApi();
  server.listen(port, '0.0.0.0');
}
