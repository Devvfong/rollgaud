import type { DeploymentDetail } from '@devdeploy/contracts';
import { renderAppShell } from '../../../components/app-shell.js';
import { renderDeploymentTimeline } from '../../../components/deployment-timeline.js';
import { renderStatusBadge } from '../../../components/status-badge.js';
export function renderDeploymentPage(deployment: DeploymentDetail): string { const recovery = deployment.status === 'recovery_failed' ? '<aside class="card" role="alert"><h2>Recovery failed</h2><p>Restore the last verified route manually and contact an operator before retrying.</p></aside>' : ''; return renderAppShell('Deployment attempt', `<h1>Deployment attempt</h1><section class="card"><p>${renderStatusBadge(deployment.status)}</p><p>Target SHA: <code>${deployment.targetSha}</code></p><p>Previous SHA: <code>${deployment.previousSha ?? 'None'}</code></p><p>Failure: ${deployment.failureCode ?? 'None'}</p></section>${recovery}<section class="card"><h2>Ordered events</h2>${renderDeploymentTimeline(deployment.events)}</section>`); }
export default renderDeploymentPage;
