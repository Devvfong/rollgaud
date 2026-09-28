import assert from 'node:assert/strict';
import test from 'node:test';
import * as contractModule from '../src/index.js';

const exportsUnderTest = contractModule as Record<string, unknown>;

function parseReleaseIdentity(input: unknown): unknown {
  const parser = exportsUnderTest.parseReleaseIdentity;

  assert.equal(typeof parser, 'function', 'parseReleaseIdentity export is missing');
  return (parser as (value: unknown) => unknown)(input);
}

function parseProjectConfig(input: unknown): unknown {
  const parser = exportsUnderTest.parseProjectConfig;

  assert.equal(typeof parser, 'function', 'parseProjectConfig export is missing');
  return (parser as (value: unknown) => unknown)(input);
}

const validRelease = {
  repository: 'devdeploy/student-api',
  branch: 'main',
  commitSha: '0123456789abcdef0123456789abcdef01234567',
  workflowRunId: '123456789',
  imageDigest: 'ghcr.io/devdeploy/student-api@sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
};

test('parses a complete GHCR release identity with a 40-character commit SHA', () => {
  assert.deepEqual(parseReleaseIdentity(validRelease), validRelease);
});

test('rejects foreign registries and malformed commit SHAs', () => {
  assert.throws(() => parseReleaseIdentity({ ...validRelease, imageDigest: validRelease.imageDigest.replace('ghcr.io', 'docker.io') }));
  assert.throws(() => parseReleaseIdentity({ ...validRelease, commitSha: 'not-a-commit' }));
});

test('parses a validated project configuration', () => {
  const project = {
    slug: 'student-api',
    repository: 'devdeploy/student-api',
    branch: 'main',
    imageNamespace: 'ghcr.io/devdeploy/student-api',
    domain: 'student-api.example.com',
    port: 3000,
    healthPath: '/health',
  };

  assert.deepEqual(parseProjectConfig(project), project);
});
