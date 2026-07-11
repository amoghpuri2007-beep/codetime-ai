import * as vscode from 'vscode';
import {
  ActivityTrackerState,
  INACTIVITY_THRESHOLD_MS,
  applyInactivity,
  createInitialActivityState,
  processActivityEvent,
  shouldEmitInactivity,
} from './activityLogic';

/**
 * Tracks editor activity from VS Code events and emits activity lifecycle events.
 *
 * This class does not persist data. It only detects active vs inactive states.
 */
export class ActivityTracker {
  private state: ActivityTrackerState;
  private readonly disposables: vscode.Disposable[] = [];
  private inactivityTimer: ReturnType<typeof setInterval> | undefined;

  private readonly _onActivity = new vscode.EventEmitter<void>();
  private readonly _onInactivity = new vscode.EventEmitter<void>();

  /** Fired whenever user activity is detected. */
  readonly onActivity = this._onActivity.event;

  /** Fired after {@link INACTIVITY_THRESHOLD_MS} with no activity. */
  readonly onInactivity = this._onInactivity.event;

  /**
   * Creates a new activity tracker.
   *
   * @param now - Optional timestamp used to initialize state (for testing).
   */
  constructor(now: number = Date.now()) {
    this.state = createInitialActivityState(now);
  }

  /**
   * Starts listening to VS Code editor events and the inactivity watchdog.
   */
  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(() => {
        this.handleEditorEvent();
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.handleEditorEvent();
      }),
      vscode.workspace.onDidSaveTextDocument(() => {
        this.handleEditorEvent();
      }),
    );

    this.inactivityTimer = setInterval(() => {
      this.runInactivityCheck(Date.now());
    }, 1_000);
  }

  /**
   * Stops event listeners and clears the inactivity watchdog.
   */
  stop(): void {
    if (this.inactivityTimer !== undefined) {
      clearInterval(this.inactivityTimer);
      this.inactivityTimer = undefined;
    }

    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  /**
   * Disposes event emitters and stops tracking.
   */
  dispose(): void {
    this.stop();
    this._onActivity.dispose();
    this._onInactivity.dispose();
  }

  /**
   * Returns a copy of the current activity state.
   *
   * @returns Current activity tracker state.
   */
  getState(): ActivityTrackerState {
    return { ...this.state };
  }

  /**
   * Processes a single activity signal. Exposed for unit tests.
   *
   * @param now - Timestamp of the detected activity.
   */
  handleActivity(now: number = Date.now()): void {
    const { nextState } = processActivityEvent(this.state, now);
    this.state = nextState;
    this._onActivity.fire();
  }

  /**
   * Evaluates inactivity and emits {@link onInactivity} when needed.
   *
   * @param now - Current timestamp in milliseconds.
   * @returns Whether an inactivity event was emitted.
   */
  runInactivityCheck(now: number = Date.now()): boolean {
    if (!shouldEmitInactivity(this.state, now, INACTIVITY_THRESHOLD_MS)) {
      return false;
    }

    this.state = applyInactivity(this.state);
    this._onInactivity.fire();
    return true;
  }

  /**
   * Routes a VS Code editor event into the activity handler.
   */
  private handleEditorEvent(): void {
    this.handleActivity(Date.now());
  }
}
