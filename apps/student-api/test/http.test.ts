import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { createServer, get, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

type StudentApiModule = {
  createStudentApi: (environment: NodeJS.ProcessEnv) => Server;
  readStudentApiConfig: (environment: NodeJS.ProcessEnv) => { commitSha: string; version: string };
};

const moduleUrl = new URL('../src/main.js', import.meta.url);

async function loadStudentApi(): Promise<StudentApiModule> {
  assert.ok(existsSync(moduleUrl), 'student API main module is missing');
  return (await import(moduleUrl.href)) as StudentApiModule;
}

async function startServer(environment: NodeJS.ProcessEnv): Promise<Server> {
  const { createStudentApi } = await loadStudentApi();
  const server = createStudentApi(environment);

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  return server;
}

async function stopServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function request(server: Server, path: string): Promise<{ statusCode: number; body: unknown }> {
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  return new Promise((resolve, reject) => {
    const request = get({ host: '127.0.0.1', port: address.port, path }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk: string) => {
        body += chunk;
      });
      response.on('end', () => {
        resolve({ statusCode: response.statusCode ?? 0, body: JSON.parse(body) });
      });
    });

    request.once('error', reject);
  });
}

const validEnvironment = {
  COMMIT_SHA: '0123456789abcdef0123456789abcdef01234567',
  APP_VERSION: 'v1',
};

test('rejects missing and malformed build commit SHAs', { concurrency: false }, async () => {
  const { readStudentApiConfig } = await loadStudentApi();

  assert.throws(() => readStudentApiConfig({ APP_VERSION: 'v1' }));
  assert.throws(() => readStudentApiConfig({ ...validEnvironment, COMMIT_SHA: 'not-a-sha' }));
});

test('serves the exact healthy response', { concurrency: false }, async () => {
  const server = await startServer(validEnvironment);

  try {
    assert.deepEqual(await request(server, '/health'), {
      statusCode: 200,
      body: { status: 'ok' },
    });
  } finally {
    await stopServer(server);
  }
});

test('serves the configured commit SHA and application version', { concurrency: false }, async () => {
  const server = await startServer(validEnvironment);

  try {
    assert.deepEqual(await request(server, '/version'), {
      statusCode: 200,
      body: { commitSha: validEnvironment.COMMIT_SHA, version: validEnvironment.APP_VERSION },
    });
  } finally {
    await stopServer(server);
  }
});

test('does not write persistent data while serving requests', { concurrency: false }, async () => {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'devdeploy-student-api-'));
  const originalDirectory = process.cwd();
  process.chdir(temporaryDirectory);

  try {
    const server = await startServer(validEnvironment);
    try {
      await request(server, '/health');
      await request(server, '/version');
    } finally {
      await stopServer(server);
    }

    assert.deepEqual(await readdir(temporaryDirectory), []);
  } finally {
    process.chdir(originalDirectory);
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
});
