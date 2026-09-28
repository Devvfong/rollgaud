import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const packagePaths = {
  '@devdeploy/api': 'apps/api/package.json',
  '@devdeploy/web': 'apps/web/package.json',
  '@devdeploy/deploy-worker': 'apps/deploy-worker/package.json',
  '@devdeploy/student-api': 'apps/student-api/package.json',
  '@devdeploy/contracts': 'packages/contracts/package.json',
  '@devdeploy/db': 'packages/db/package.json',
};
const failures = [];

function readJson(relativePath) {
  const filePath = resolve(root, relativePath);

  if (!existsSync(filePath)) {
    failures.push(`missing ${relativePath}`);
    return undefined;
  }

  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`invalid JSON in ${relativePath}: ${error.message}`);
    return undefined;
  }
}

const rootManifest = readJson('package.json');

for (const script of ['lint', 'test', 'build', 'typecheck']) {
  if (typeof rootManifest?.scripts?.[script] !== 'string' || rootManifest.scripts[script].length === 0) {
    failures.push(`root script ${script} is missing`);
  }
}

for (const [expectedName, relativePath] of Object.entries(packagePaths)) {
  const manifest = readJson(relativePath);

  if (manifest && manifest.name !== expectedName) {
    failures.push(`${relativePath} must declare ${expectedName}`);
  }
}

for (const requiredPath of ['docs/devdeploy-practicum-specification.md', '.env.example']) {
  if (!existsSync(resolve(root, requiredPath))) {
    failures.push(`missing ${requiredPath}`);
  }
}

try {
  execFileSync('git', ['ls-files', '--error-unmatch', '.env'], {
    cwd: root,
    stdio: 'ignore',
  });
  failures.push('.env is tracked');
} catch {
  // Expected: a local environment file must remain untracked.
}

if (failures.length > 0) {
  console.error('Workspace check failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log('Workspace check passed.');
}
