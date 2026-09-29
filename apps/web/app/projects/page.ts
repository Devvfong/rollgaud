import type { ProjectSummary } from '@devdeploy/contracts';
import { renderAppShell } from '../../components/app-shell.js';
import { renderStatusBadge } from '../../components/status-badge.js';
import { renderUiState } from '../../components/ui-state.js';
export function renderProjectsPage(projects: ProjectSummary[]): string { const body = projects.length ? `<div class="grid">${projects.map((project) => `<article class="card"><h2><a href="/projects/${project.id}">${project.name}</a></h2><p>${project.domain}</p><p>${renderStatusBadge(project.health)} ${project.currentSha ?? 'No release'}</p></article>`).join('')}</div>` : renderUiState('empty', 'Create your first project to begin.'); return renderAppShell('Projects', `<h1>Projects</h1>${body}<button class="accent" type="button">Create project</button>`); }
export default renderProjectsPage;
