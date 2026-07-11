/** Milliseconds of idle time before the user is considered inactive. */
export const INACTIVITY_THRESHOLD_MS = 60_000;

/** Snapshot of activity-detection state. */
export interface ActivityTrackerState {
  isActive: boolean;
  lastActivityAt: number;
}

/**
 * Creates the initial activity tracker state.
 *
 * @param now - Current timestamp in milliseconds.
 * @returns A new inactive activity state anchored at {@link now}.
 */
export function createInitialActivityState(now: number): ActivityTrackerState {
  return {
    isActive: false,
    lastActivityAt: now,
  };
}

/**
 * Applies an activity signal and determines whether an activity event should fire.
 *
 * @param state - Current activity state.
 * @param now - Timestamp of the detected activity.
 * @returns Updated state and whether {@code onActivity} should be emitted.
 */
export function processActivityEvent(
  state: ActivityTrackerState,
  now: number,
): { nextState: ActivityTrackerState; shouldEmitActivity: boolean } {
  const shouldEmitActivity = !state.isActive;

  return {
    nextState: {
      isActive: true,
      lastActivityAt: now,
    },
    shouldEmitActivity,
  };
}

/**
 * Determines whether the user has exceeded the inactivity threshold.
 *
 * @param state - Current activity state.
 * @param now - Current timestamp in milliseconds.
 * @param thresholdMs - Idle threshold in milliseconds.
 * @returns True when the user should be marked inactive.
 */
export function shouldEmitInactivity(
  state: ActivityTrackerState,
  now: number,
  thresholdMs: number = INACTIVITY_THRESHOLD_MS,
): boolean {
  return state.isActive && now - state.lastActivityAt >= thresholdMs;
}

/**
 * Marks the user as inactive while preserving the last activity timestamp.
 *
 * @param state - Current activity state.
 * @returns Updated state with {@code isActive} set to false.
 */
export function applyInactivity(state: ActivityTrackerState): ActivityTrackerState {
  return {
    ...state,
    isActive: false,
  };
}
