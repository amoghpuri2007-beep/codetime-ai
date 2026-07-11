/**
 * Formats a duration in seconds as a compact hours/minutes label.
 *
 * @param totalSeconds - Total duration in seconds.
 * @returns Formatted label such as {@code 1h 23m} or {@code 45m}.
 */
export function formatDurationShort(totalSeconds: number): string {
  const safeSeconds = Math.max(0, totalSeconds);
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
