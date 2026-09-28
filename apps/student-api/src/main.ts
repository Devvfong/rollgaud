import { createServer, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

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

export function createStudentApi(environment: NodeJS.ProcessEnv = process.env): Server {
  const config = readStudentApiConfig(environment);

  return createServer((request, response) => {
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
