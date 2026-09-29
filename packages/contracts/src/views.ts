import type { DeploymentStatus } from './deployment.js';
export type HealthLabel = 'Healthy' | 'Unhealthy' | 'Unknown';
export interface ProjectSummary { id: string; name: string; slug: string; domain: string; currentSha: string | null; currentDigest: string | null; health: HealthLabel; lastAttemptStatus: DeploymentStatus | null; }
export interface ReleaseSummary { id: string; commitSha: string; imageDigest: string; approvedAt: string; status: 'approved' | 'deployed' | 'failed'; }
export interface DeploymentEvent { sequence: number; eventCode: string; message: string; createdAt: string; }
export interface DeploymentDetail { id: string; project: ProjectSummary; status: DeploymentStatus; targetSha: string; previousSha: string | null; imageDigest: string; failureCode: string | null; recoveryResult: string | null; events: DeploymentEvent[]; }
export interface ProjectDetail extends ProjectSummary { releases: ReleaseSummary[]; deployments: DeploymentDetail[]; }
export interface DashboardSummary { projectCount: number; healthyCount: number; unhealthyCount: number; latestAttempt: DeploymentDetail | null; recentFailures: DeploymentDetail[]; }
