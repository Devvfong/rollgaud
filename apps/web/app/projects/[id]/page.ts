import type { ProjectDetail } from '@devdeploy/contracts';
import { renderAppShell } from '../../../components/app-shell.js';
import { renderConfirmAction } from '../../../components/confirm-action.js';
import { renderStatusBadge } from '../../../components/status-badge.js';
export function renderProjectDetailPage(project: ProjectDetail): string { return renderAppShell(project.name, `<h1>${project.name}</h1><section class="card"><h2>Current serving SHA</h2><p><code>${project.currentSha ?? 'None'}</code></p><p>${renderStatusBadge(project.health)} ${project.domain}</p><button class="accent" type="button">Deploy approved release</button> <button type="button">Rollback</button></section><section class="card"><h2>Approved releases</h2>${project.releases.map((release) => `<p><code>${release.commitSha}</code> · ${release.status}</p>`).join('')}</section>${renderConfirmAction('deploy', 'Review the approved digest before queueing this attempt.')}`); }
export default renderProjectDetailPage;
