/**
 * The release a build's reports are filed under, `<version>+<commit>`
 * (ADR-084): tracker.ts sets it on each report, and vite.config.ts uploads
 * the build's source maps under it, so the two cannot drift apart and
 * leave the traces unreadable. A module of its own, importing nothing,
 * since vite.config.ts loads it, and cannot load build.ts, which reads
 * __BUILD__.
 */
export function releaseOf({
  version,
  build,
}: {
  version: string;
  build: string;
}): string {
  return `${version}+${build}`;
}
