import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const workflow = (name) => resolve(root, '.github', 'workflows', name);
const required = ['ci.yml', 'release.yml', 'scan-demo.yml'];

for (const name of required) {
  if (!existsSync(workflow(name))) throw new Error(`missing workflow: .github/workflows/${name}`);
}

const ci = readFileSync(workflow('ci.yml'), 'utf8');
const release = readFileSync(workflow('release.yml'), 'utf8');
const demo = readFileSync(workflow('scan-demo.yml'), 'utf8');
const parser = readFileSync(resolve(root, 'apps', 'api', 'src', 'github', 'manifest-parser.ts'), 'utf8');
const fixture = JSON.parse(readFileSync(resolve(root, 'apps', 'api', 'test', 'fixtures', 'release-manifest.json'), 'utf8'));

const manifestFields = ['repository', 'branch', 'workflowRunId', 'commitSha', 'imageDigest'];
if (!parser.includes("'branch,commitSha,imageDigest,repository,workflowRunId'")) {
  throw new Error('Task 6 manifest parser no longer exposes the expected exact identity schema');
}
if (Object.keys(fixture).sort().join(',') !== [...manifestFields].sort().join(',')) {
  throw new Error('release manifest fixture does not match the Task 6 identity schema');
}

function requireText(source, pattern, description) {
  if (!pattern.test(source)) throw new Error(`workflow check failed: ${description}`);
}

function forbidText(source, pattern, description) {
  if (pattern.test(source)) throw new Error(`workflow check failed: ${description}`);
}

function checkPinnedActions(source, description) {
  const actions = [...source.matchAll(/^\s*uses:\s*([^\s#]+)\s*$/gm)].map((match) => match[1]);
  if (actions.length === 0 || actions.some((action) => !/@[0-9a-f]{40}$/i.test(action))) {
    throw new Error(`workflow check failed: ${description} must pin every action to a full commit SHA`);
  }
}

requireText(ci, /pull_request:\s*\n\s*branches:\s*\n\s*-\s*main/, 'CI verifies pull requests targeting protected main');
requireText(ci, /push:\s*\n\s*branches:\s*\n\s*-\s*main/, 'CI verifies pushes to protected main');
requireText(ci, /verify:[\s\S]*actions\/checkout@[0-9a-f]{40}[\s\S]*fetch-depth:\s*0/, 'CI fetches PR history for repository scanning');
requireText(
  ci,
  /publish:\s*\n\s*needs:\s*verify\s*\n\s*if:\s*>-\s*\n[\s\S]*github\.event_name\s*==\s*'push'[\s\S]*github\.ref\s*==\s*'refs\/heads\/main'[\s\S]*github\.ref_protected/,
  'CI publishes only from a protected main push after verify',
);
requireText(ci, /contents:\s*read/, 'CI grants contents read');
requireText(ci, /packages:\s*write/, 'CI grants package write only to publish');
requireText(ci, /corepack pnpm lint[\s\S]*corepack pnpm test/, 'CI runs lint and tests');
requireText(ci, /gitleaks\/gitleaks-action@[0-9a-f]{40}/i, 'CI runs pinned Gitleaks');
requireText(ci, /aquasecurity\/trivy-action@[0-9a-f]{40}/i, 'CI runs pinned Trivy');
requireText(ci, /severity:\s*CRITICAL[\s\S]*exit-code:\s*['"]?1/, 'Trivy blocks fixable critical findings');
requireText(ci, /name:\s*release-manifest/, 'CI uploads the named release manifest artifact');
requireText(ci, /const expected = \['branch', 'commitSha', 'imageDigest', 'repository', 'workflowRunId'\]/, 'CI declares the exact Task 6 manifest schema');
for (const field of manifestFields) requireText(ci, new RegExp(`\\b${field}\\b`), `CI manifest contains ${field}`);
checkPinnedActions(ci, 'CI');

requireText(release, /workflow_run:\s*\n\s*workflows:\s*\[CI\]\s*\n\s*types:\s*\[completed\]/, 'release listens only to completed CI');
requireText(release, /github\.event\.workflow_run\.conclusion\s*==\s*'success'/, 'release requires successful CI');
requireText(release, /github\.event\.workflow_run\.event\s*==\s*'push'/, 'release requires a CI push run');
requireText(release, /github\.event\.workflow_run\.head_branch\s*==\s*'main'/, 'release requires protected main');
requireText(release, /github\.event\.workflow_run\.repository\.full_name\s*==\s*github\.repository/, 'release requires configured repository');
requireText(release, /environment:\s*devdeploy-production/, 'release uses protected deployment environment');
requireText(release, /name:\s*release-manifest[\s\S]*run-id:\s*\$\{\{ github\.event\.workflow_run\.id \}\}/, 'release downloads only the triggering run manifest');
requireText(release, /const expected = \['branch', 'commitSha', 'imageDigest', 'repository', 'workflowRunId'\]/, 'release validates the exact Task 6 manifest schema');
requireText(release, /\/api\/v1\/ci\/projects/, 'release submits the Task 7 admission request');
forbidText(release, /actions\/checkout/i, 'release must not check out completed-run code');
forbidText(release, /^\s*run:[\s\S]*github\.event\.workflow_run\./m, 'release must not interpolate workflow_run data into shell');
checkPinnedActions(release, 'release');

requireText(demo, /demo\/blocked-by-secrets/, 'demo scans secret demo branch');
requireText(demo, /demo\/blocked-by-vuln/, 'demo scans vulnerable demo branch');
requireText(demo, /gitleaks\/gitleaks-action@[0-9a-f]{40}/i, 'demo runs pinned Gitleaks');
requireText(demo, /aquasecurity\/trivy-action@[0-9a-f]{40}/i, 'demo runs pinned Trivy');
forbidText(demo, /secrets\.|environment:|workflow_run:|\/api\/v1\/ci|curl\s/i, 'demo must not have release credentials or deployment path');
checkPinnedActions(demo, 'demo');

console.log('workflow static checks passed');
