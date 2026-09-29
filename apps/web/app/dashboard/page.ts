import type { DashboardSummary } from '@devdeploy/contracts';
import { renderAppShell } from '../../components/app-shell.js';
import { renderStatusBadge } from '../../components/status-badge.js';
import { renderUiState } from '../../components/ui-state.js';
export function renderDashboardPage(data: DashboardSummary): string { const latest = data.latestAttempt ? `<p>Latest attempt: ${renderStatusBadge(data.latestAttempt.status)}</p>` : renderUiState('empty', 'No deployment attempts yet.'); return renderAppShell('Overview', `<h1>Overview</h1><div class="grid"><section class="card"><h2>Projects</h2><p>${data.projectCount}</p></section><section class="card"><h2>Healthy</h2><p>${data.healthyCount}</p></section><section class="card"><h2>Unhealthy</h2><p>${data.unhealthyCount}</p></section></div><section class="card"><h2>Recent activity</h2>${latest}</section>`); }
export default renderDashboardPage;
