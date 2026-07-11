import * as vscode from 'vscode';
import { SessionRecord } from '../storage/schema';
import { GitTracker } from '../trackers/GitTracker';
import { LanguageTracker } from '../trackers/LanguageTracker';
import { ProjectTracker } from '../trackers/ProjectTracker';
import { ActivityTracker } from './ActivityTracker';
import { FocusDetector } from './FocusDetector';
import {
  PendingSession,
  createPendingSession,
  generateSessionId,
  pauseSession,
  recordActivityBurst,
} from './sessionLogic';

/**
 * Evaluates whether a pending session should be ended after inactivity.
 *
 * @param hasPendingSession - Whether a session is currently open.
 * @returns True when an open session should be finalized.
 */
export function shouldEndSessionOnInactivity(hasPendingSession: boolean): boolean {
  return hasPendingSession;
}

/**
 * Evaluates whether a pending session should be ended when the editor closes.
 *
 * @param hasPendingSession - Whether a session is currently open.
 * @returns True when an open session should be finalized.
 */
export function shouldEndSessionOnEditorClose(hasPendingSession: boolean): boolean {
  return hasPendingSession;
}

/**
 * Manages coding session lifecycle in response to activity and editor events.
 */
export class SessionManager {
  private pendingSession: PendingSession | null = null;
  private readonly completedSessions: SessionRecord[] = [];
  private readonly disposables: vscode.Disposable[] = [];

  /**
   * Creates a session manager wired to activity, focus, tracker, and storage services.
   *
   * @param activityTracker - Source of activity and inactivity events.
   * @param focusDetector - Focus session classifier and persistence helper.
   * @param projectTracker - Workspace project metadata and stats tracker.
   * @param languageTracker - Editor language metadata and stats tracker.
   * @param gitTracker - Git branch metadata tracker.
   */
  constructor(
    private readonly activityTracker: ActivityTracker,
    private readonly focusDetector: FocusDetector,
    private readonly projectTracker: ProjectTracker,
    private readonly languageTracker: LanguageTracker,
    private readonly gitTracker: GitTracker,
  ) {}

  /**
   * Starts session tracking and subscribes to activity/editor lifecycle events.
   */
  start(): void {
    this.disposables.push(
      this.activityTracker.onActivity(() => {
        this.handleActivity(Date.now());
      }),
      this.activityTracker.onInactivity(() => {
        this.handleInactivity(Date.now());
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor === undefined) {
          this.handleEditorClosed(Date.now());
        }
      }),
    );
  }

  /**
   * Ends the current session synchronously and stops listeners.
   *
   * Called during VS Code deactivation to flush any in-progress session.
   */
  flush(): void {
    this.endCurrentSession(Date.now());
    this.stop();
  }

  /**
   * Stops session event listeners without flushing data.
   */
  stop(): void {
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  /**
   * Returns the in-progress pending session, if any.
   *
   * @returns Current pending session or null.
   */
  getPendingSession(): PendingSession | null {
    if (this.pendingSession === null) {
      return null;
    }

    return {
      ...this.pendingSession,
      segments: [...this.pendingSession.segments],
      inactivityGapsMs: [...this.pendingSession.inactivityGapsMs],
    };
  }

  /**
   * Returns sessions completed during this runtime.
   *
   * @returns Completed session records.
   */
  getCompletedSessions(): SessionRecord[] {
    return [...this.completedSessions];
  }

  /**
   * Handles a user activity event by starting or resuming a session.
   *
   * @param now - Timestamp of the activity event.
   */
  handleActivity(now: number): void {
    if (this.pendingSession === null) {
      const projectContext = this.projectTracker.getProjectContext();
      this.pendingSession = createPendingSession(
        generateSessionId(now),
        now,
        this.languageTracker.getCurrentLanguage(),
        projectContext.projectName,
        projectContext.projectPath,
      );
      return;
    }

    this.pendingSession = recordActivityBurst(this.pendingSession, now);
  }

  /**
   * Pauses and ends the current session after prolonged inactivity.
   *
   * @param now - Timestamp when inactivity was detected.
   */
  handleInactivity(now: number): void {
    if (!shouldEndSessionOnInactivity(this.pendingSession !== null)) {
      return;
    }

    this.pendingSession = pauseSession(this.pendingSession!);
    this.endCurrentSession(now);
  }

  /**
   * Ends the current session when the active editor is closed.
   *
   * @param now - Timestamp when the editor was closed.
   */
  handleEditorClosed(now: number): void {
    if (!shouldEndSessionOnEditorClose(this.pendingSession !== null)) {
      return;
    }

    this.endCurrentSession(now);
  }

  /**
   * Finalizes and synchronously persists the current session with tracker metadata.
   *
   * @param endMs - Session end timestamp in milliseconds.
   */
  private endCurrentSession(endMs: number): void {
    if (this.pendingSession === null) {
      return;
    }

    const branch = this.gitTracker.getCurrentBranch();
    const sessionRecord = this.focusDetector.finalizeSession(this.pendingSession, endMs, branch);

    this.completedSessions.push(sessionRecord);
    this.pendingSession = null;

    this.projectTracker.onSessionEnd(sessionRecord);
    this.languageTracker.onSessionEnd(sessionRecord);
    this.focusDetector.persistSession(sessionRecord);
  }
}
