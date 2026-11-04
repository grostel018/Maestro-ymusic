export function formatSentryRelease(version: string, gitHash: string | undefined): string {
	const short = gitHash?.slice(0, 7);
	return short ? `maestro@${version}+${short}` : `maestro@${version}`;
}
