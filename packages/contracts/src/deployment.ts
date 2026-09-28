export const deploymentStatuses = [
  'queued',
  'preparing',
  'probing',
  'switching',
  'succeeded',
  'failed',
  'rolled_back',
  'recovery_failed',
  'cancelled',
] as const;

export type DeploymentStatus = (typeof deploymentStatuses)[number];
