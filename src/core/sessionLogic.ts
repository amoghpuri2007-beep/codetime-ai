import { SessionRecord } from '../storage/schema';

/** Minimum gap in milliseconds between keystrokes to start a new activity burst. */
export const ACTIVITY_BURST_GAP_MS = 1_000;

/** A contiguous period of editor activity within a session. */
export interface ActivitySegment {
  startMs: number;
  endMs: number;
}

/** Mutable in-progress session used before persistence. */
export interface PendingSession {
  id: string;
  startMs: number;
  language: string;
  projectName: string;
  projectPath: string;
  segments: ActivitySegment[];
  inactivityGapsMs: number[];
  lastActiveMs: number;
  currentSegmentStartMs: number | null;
}

/**
 * Generates a unique session identifier.
 *
 * @param now - Current timestamp in milliseconds.
 * @returns A unique session id composed of timestamp and random suffix.
 */
export function generateSessionId(now: number = Date.now()): string {
  return `${now}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Creates a new pending session for the supplied editor context.
 *
 * @param id - Unique session identifier.
 * @param now - Session start timestamp in milliseconds.
 * @param language - Active document language id.
 * @param projectName - Workspace folder or project display name.
 * @param projectPath - Absolute project path.
 * @returns A new pending session with an initial activity segment.
 */
export function createPendingSession(
  id: string,
  now: number,
  language: string,
  projectName: string,
  projectPath: string,
): PendingSession {
  return {
    id,
    startMs: now,
    language,
    projectName,
    projectPath,
    segments: [],
    inactivityGapsMs: [],
    lastActiveMs: now,
    currentSegmentStartMs: now,
  };
}

/**
 * Records an activity burst, splitting segments when idle gaps are detected.
 *
 * @param session - Current pending session.
 * @param now - Timestamp of the latest activity event.
 * @returns Updated pending session after applying the activity burst.
 */
export function recordActivityBurst(session: PendingSession, now: number): PendingSession {
  const nextSession: PendingSession = {
    ...session,
    segments: [...session.segments],
    inactivityGapsMs: [...session.inactivityGapsMs],
  };

  const gapMs = now - nextSession.lastActiveMs;

  if (nextSession.currentSegmentStartMs !== null && gapMs > ACTIVITY_BURST_GAP_MS) {
    nextSession.segments.push({
      startMs: nextSession.currentSegmentStartMs,
      endMs: nextSession.lastActiveMs,
    });
    nextSession.inactivityGapsMs.push(gapMs);
    nextSession.currentSegmentStartMs = now;
  } else if (nextSession.currentSegmentStartMs === null) {
    if (gapMs > ACTIVITY_BURST_GAP_MS) {
      nextSession.inactivityGapsMs.push(gapMs);
    }
    nextSession.currentSegmentStartMs = now;
  }

  nextSession.lastActiveMs = now;
  return nextSession;
}

/**
 * Closes the open activity segment without ending the session.
 *
 * @param session - Current pending session.
 * @returns Updated pending session with the active segment closed.
 */
export function pauseSession(session: PendingSession): PendingSession {
  if (session.currentSegmentStartMs === null) {
    return session;
  }

  const endMs = session.lastActiveMs;
  return {
    ...session,
    segments: [
      ...session.segments,
      {
        startMs: session.currentSegmentStartMs,
        endMs,
      },
    ],
    currentSegmentStartMs: null,
  };
}

/**
 * Calculates total active milliseconds across recorded segments.
 *
 * @param segments - Completed activity segments.
 * @param openSegmentStartMs - Start of the currently open segment, if any.
 * @param lastActiveMs - Timestamp of the most recent activity.
 * @returns Total active time in milliseconds.
 */
export function calculateActiveDurationMs(
  segments: ActivitySegment[],
  openSegmentStartMs: number | null,
  lastActiveMs: number,
): number {
  const completedMs = segments.reduce((total, segment) => {
    return total + Math.max(0, segment.endMs - segment.startMs);
  }, 0);

  if (openSegmentStartMs === null) {
    return completedMs;
  }

  return completedMs + Math.max(0, lastActiveMs - openSegmentStartMs);
}

/**
 * Converts a pending session into a persisted {@link SessionRecord}.
 *
 * @param session - Pending session to finalize.
 * @param endMs - Session end timestamp in milliseconds.
 * @param isFocusSession - Whether the session qualifies as a focus session.
 * @returns A finalized session record ready for storage.
 */
export function finalizeSessionRecord(
  session: PendingSession,
  endMs: number,
  isFocusSession: boolean,
  branch: string,
): SessionRecord {
  const pausedSession = pauseSession(session);
  const durationSeconds = Math.round(
    calculateActiveDurationMs(
      pausedSession.segments,
      pausedSession.currentSegmentStartMs,
      pausedSession.lastActiveMs,
    ) / 1000,
  );

  return {
    id: pausedSession.id,
    startTime: new Date(pausedSession.startMs).toISOString(),
    endTime: new Date(endMs).toISOString(),
    durationSeconds,
    language: pausedSession.language,
    projectName: pausedSession.projectName,
    projectPath: pausedSession.projectPath,
    branch,
    isFocusSession,
  };
}
