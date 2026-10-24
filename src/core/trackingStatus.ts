/** Current tracking state shown in the status bar and dashboard. */
export interface TrackingStatus {
  state: 'tracking' | 'idle' | 'window-inactive' | 'no-editor' | 'unsupported-editor' | 'manual';
  language: string | null;
}

/** Formats a tracking state for display without exposing internal state names. */
export function formatTrackingStatus(status: TrackingStatus): string {
  switch (status.state) {
    case 'tracking':
      return status.language ? `Tracking · ${status.language}` : 'Tracking';
    case 'idle':
      return 'Paused · Idle';
    case 'window-inactive':
      return 'Paused · Window inactive';
    case 'no-editor':
      return 'Paused · No editor';
    case 'unsupported-editor':
      return 'Paused · Unsupported editor';
    case 'manual':
      return 'Paused · Manual';
  }
}
