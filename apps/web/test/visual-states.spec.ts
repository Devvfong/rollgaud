import assert from 'node:assert/strict';
import test from 'node:test';

import { renderDashboardPage } from '../app/dashboard/page.js';
import { renderDeploymentPage } from '../app/deployments/[id]/page.js';
import { renderLoginPage } from '../app/login/page.js';
import { renderProjectDetailPage } from '../app/projects/[id]/page.js';
import { renderProjectsPage } from '../app/projects/page.js';
import { fixtureProvider } from '../lib/fixture-data.js';

test('all five routes expose titles and key operational fields', () => {
  const provider = fixtureProvider();
  assert.match(renderLoginPage(), /RollGaud/);
  assert.match(renderDashboardPage(provider.dashboard()), /Overview/);
  assert.match(renderProjectsPage(provider.projects()), /Projects/);
  assert.match(renderProjectDetailPage(provider.project()), /Current serving SHA/);
  assert.match(renderDeploymentPage(provider.deployment()), /Deployment attempt/);
  assert.match(renderDeploymentPage(provider.deployment()), /recovery_failed|Recovery failed/);
});

test('status labels are text-accessible, recovery failure has remediation, and dialog dismisses by keyboard', () => {
  const detail = renderDeploymentPage(fixtureProvider().deployment());
  assert.match(detail, /aria-label="Recovery failed"/);
  assert.match(detail, /Restore the last verified route|operator/i);
  const project = renderProjectDetailPage(fixtureProvider().project());
  assert.match(project, /role="dialog"/);
  assert.match(project, /aria-label="Close confirmation"/);
  assert.match(project, /Escape/);
});

test('responsive shell prevents horizontal overflow at mobile and desktop widths', () => {
  const html = renderProjectDetailPage(fixtureProvider().project());
  assert.match(html, /viewport/);
  assert.match(html, /max-width:\s*1200px/);
  assert.match(html, /overflow-x:\s*hidden/);
  assert.doesNotMatch(html, /workflow.*token|GITHUB_READ_TOKEN|DATABASE_URL/i);
});
