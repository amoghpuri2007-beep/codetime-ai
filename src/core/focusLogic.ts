import { ActivitySegment } from './sessionLogic';

/** Minimum active duration required for a focus session (25 minutes). */
export const FOCUS_MIN_DURATION_SECONDS = 25 * 60;

/** Maximum allowed idle gap within a focus session (2 minutes). */
export const FOCUS_MAX_GAP_SECONDS = 2 * 60;

/**
 * Calculates total active seconds from completed and open segments.
 *
 * @param segments - Completed activity segments.
 * @param openSegmentStartMs - Start of the open segment, if any.
 * @param lastActiveMs - Timestamp of the latest activity.
 * @returns Active duration rounded to whole seconds.
 */
export function calculateActiveSeconds(
  segments: ActivitySegment[],
  openSegmentStartMs: number | null,
  lastActiveMs: number,
): number {
  const completedMs = segments.reduce((total, segment) => {
    return total + Math.max(0, segment.endMs - segment.startMs);
  }, 0);

  const openMs =
    openSegmentStartMs === null ? 0 : Math.max(0, lastActiveMs - openSegmentStartMs);

  return Math.round((completedMs + openMs) / 1000);
}

/**
 * Returns the largest inactivity gap in seconds.
 *
 * @param gapsMs - Recorded inactivity gaps in milliseconds.
 * @returns Maximum gap in seconds, or zero when no gaps exist.
 */
export function getMaxGapSeconds(gapsMs: number[]): number {
  if (gapsMs.length === 0) {
    return 0;
  }

  return Math.max(...gapsMs) / 1000;
}

/**
 * Determines whether a session qualifies as a focus session.
 *
 * A focus session requires at least 25 minutes of active time and no
 * inactivity gap greater than 2 minutes.
 *
 * @param activeSeconds - Total active duration in seconds.
 * @param gapsMs - Inactivity gaps recorded during the session.
 * @returns True when the session meets focus criteria.
 */
export function isFocusSession(
  activeSeconds: number,
  gapsMs: number[],
  minimumSeconds: number = FOCUS_MIN_DURATION_SECONDS,
): boolean {
  if (activeSeconds < minimumSeconds) {
    return false;
  }

  return getMaxGapSeconds(gapsMs) <= FOCUS_MAX_GAP_SECONDS;
}
