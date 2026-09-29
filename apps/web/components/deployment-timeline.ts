import type { DeploymentEvent } from '@devdeploy/contracts';
export function renderDeploymentTimeline(events: DeploymentEvent[]): string { return `<ol class="timeline">${events.map((event) => `<li><strong>${event.sequence}. ${event.eventCode}</strong><p>${event.message}</p><small class="muted">${event.createdAt}</small></li>`).join('')}</ol>`; }
