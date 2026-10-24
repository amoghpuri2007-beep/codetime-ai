/**
 * Formats a duration as a compact stopwatch label with whole seconds.
 *
 * @param totalSeconds - Total duration in seconds.
 * @returns Formatted label such as {@code 1h 02m 03s}, {@code 1m 08s}, or {@code 45s}.
 */
export function formatDurationShort(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, '0');

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, '0')}m ${paddedSeconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${paddedSeconds}s`;
  }

  return `${seconds}s`;
}
