import * as vscode from 'vscode';
import { SessionRecord } from '../storage/schema';
import { StorageManager } from '../storage/StorageManager';
import { notifyFocusSessionComplete, processDailyMilestones } from '../utils/notifications';
import { calculateActiveSeconds, isFocusSession } from './focusLogic';
import {
  PendingSession,
  finalizeSessionRecord,
  pauseSession,
} from './sessionLogic';

type NotificationHandler = (message: string) => Thenable<string | undefined>;

/**
 * Classifies focus sessions and keeps a dedicated focus-session index.
 */
export class FocusDetector {
  private readonly runtimeFocusSessions = new Map<string, SessionRecord>();
  private readonly showNotification: NotificationHandler;

  /**
   * Creates a focus detector backed by local storage.
   *
   * @param storageManager - Storage manager used to persist focus sessions.
   * @param showNotification - Optional VS Code notification handler for testing.
   */
  constructor(
    private readonly storageManager: StorageManager,
    showNotification: NotificationHandler = vscode.window.showInformationMessage,
  ) {
    this.showNotification = showNotification;
  }

  /**
   * Converts a pending session into a finalized record with focus classification.
   *
   * @param session - Pending session to evaluate.
   * @param endMs - Session end timestamp in milliseconds.
   * @param branch - Git branch active when the session ended.
   * @returns Finalized session record with {@code isFocusSession} populated.
   */
  finalizeSession(session: PendingSession, endMs: number, branch: string): SessionRecord {
    const pausedSession = pauseSession(session);
    const activeSeconds = calculateActiveSeconds(
      pausedSession.segments,
      pausedSession.currentSegmentStartMs,
      pausedSession.lastActiveMs,
    );
    const qualifiesAsFocus = isFocusSession(activeSeconds, pausedSession.inactivityGapsMs);
    const record = finalizeSessionRecord(pausedSession, endMs, qualifiesAsFocus, branch);

    if (qualifiesAsFocus) {
      this.runtimeFocusSessions.set(record.id, record);
    }

    return record;
  }

  /**
   * Persists a finalized session, updates daily focus totals, and fires rewards.
   *
   * @param session - Completed session record to save.
   */
  persistSession(session: SessionRecord): void {
    const wasFocusSession = session.isFocusSession;

    this.storageManager.updateDaily(session);

    if (wasFocusSession) {
      notifyFocusSessionComplete(this.showNotification);
    }

    processDailyMilestones(this.storageManager, this.showNotification);

    if (session.isFocusSession) {
      this.runtimeFocusSessions.set(session.id, session);
    }
  }

  /**
   * Returns all focus sessions from runtime memory and stored daily records.
   *
   * @returns De-duplicated focus session records sorted by start time.
   */
  getFocusSessions(): SessionRecord[] {
    const merged = new Map<string, SessionRecord>(this.runtimeFocusSessions);

    for (const session of this.loadFocusSessionsFromStorage()) {
      merged.set(session.id, session);
    }

    return Array.from(merged.values()).sort((left, right) => {
      return left.startTime.localeCompare(right.startTime);
    });
  }

  /**
   * Returns the total number of focus sessions logged today.
   *
   * @returns Focus session count from today's daily stats.
   */
  getTodayFocusSessionCount(): number {
    return this.storageManager.getTodayStats().focusSessions;
  }

  /**
   * Checks whether a pending session currently meets focus duration requirements.
   *
   * @param session - Pending session to inspect.
   * @returns True when active time meets the 25-minute focus threshold.
   */
  isFocused(session: PendingSession | null): boolean {
    if (session === null) {
      return false;
    }

    const activeSeconds = calculateActiveSeconds(
      session.segments,
      session.currentSegmentStartMs,
      session.lastActiveMs,
    );

    return isFocusSession(activeSeconds, session.inactivityGapsMs);
  }

  /**
   * Loads focus sessions persisted in daily storage aggregates.
   *
   * @returns Focus sessions discovered in stored daily stats.
   */
  private loadFocusSessionsFromStorage(): SessionRecord[] {
    const data = this.storageManager.read();
    const focusSessions: SessionRecord[] = [];

    for (const daily of Object.values(data.daily)) {
      for (const session of daily.sessions) {
        if (session.isFocusSession) {
          focusSessions.push(session);
        }
      }
    }

    return focusSessions;
  }
}
