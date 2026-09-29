import type { DeploymentDetail, DeploymentStatus } from '@devdeploy/contracts';
import type { ApiClient } from './api-client.js';
const terminal = new Set<DeploymentStatus>(['succeeded', 'failed', 'rolled_back', 'recovery_failed', 'cancelled']);
type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;
export async function pollDeployment(id: string, onUpdate: (deployment: DeploymentDetail) => void, signal: AbortSignal, client: ApiClient, sleep: Sleep = defaultSleep): Promise<DeploymentDetail> { while (true) { if (signal.aborted) throw new DOMException('Polling aborted', 'AbortError'); const deployment = await client.get<DeploymentDetail>(`/api/v1/deployments/${encodeURIComponent(id)}`); onUpdate(deployment); if (terminal.has(deployment.status)) return deployment; await sleep(3_000, signal); } }
function defaultSleep(ms: number, signal: AbortSignal): Promise<void> { return new Promise((resolve, reject) => { const timer = setTimeout(resolve, ms); signal.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Polling aborted', 'AbortError')); }, { once: true }); }); }
