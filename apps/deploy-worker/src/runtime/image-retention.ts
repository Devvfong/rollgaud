const digestPattern = /^ghcr\.io\/[a-z0-9][a-z0-9._-]*(?:\/[a-z0-9][a-z0-9._-]*)+@sha256:[a-f0-9]{64}$/;
export async function ensureApprovedImage(digest: string, inspect: () => Promise<boolean>, pull: () => Promise<boolean>): Promise<void> {
  if (!digestPattern.test(digest)) throw new TypeError('approved image digest is malformed');
  if (await inspect()) return;
  if (!(await pull()) || !(await inspect())) throw new Error('approved image is unavailable from registry');
}
export function shouldCleanupPreviousSlot(switchedAt: Date, now: Date): boolean { return now.valueOf() - switchedAt.valueOf() >= 30 * 60 * 1000; }
export function retainedImageDigests(active: string, knownGood: string): Set<string> { return new Set([active, knownGood]); }
