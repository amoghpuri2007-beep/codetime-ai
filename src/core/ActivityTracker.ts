import * as vscode from 'vscode';
import { ConfigManager } from '../utils/ConfigManager';
import { mapLanguageIdToDisplayName } from '../trackers/languageLogic';
import { TrackingStatus } from './trackingStatus';
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
  private manuallyPaused: boolean;
  private pauseReason: Exclude<TrackingStatus['state'], 'tracking'> = 'no-editor';
  private lastPublishedStatus: TrackingStatus | undefined;

  private readonly _onActivity = new vscode.EventEmitter<void>();
  private readonly _onInactivity = new vscode.EventEmitter<void>();
  private readonly _onDidChangeStatus = new vscode.EventEmitter<TrackingStatus>();
  readonly onDidChangeStatus = this._onDidChangeStatus.event;

  /** Fired whenever user activity is detected. */
  readonly onActivity = this._onActivity.event;

  /** Fired after {@link INACTIVITY_THRESHOLD_MS} with no activity. */
  readonly onInactivity = this._onInactivity.event;

  /**
   * Creates a new activity tracker.
   *
   * @param now - Optional timestamp used to initialize state (for testing).
   */
  constructor(now: number = Date.now(), initiallyPaused: boolean = false) {
    this.state = createInitialActivityState(now);
    this.manuallyPaused = initiallyPaused;
  }

  /**
   * Starts listening to VS Code editor events and the inactivity watchdog.
   */
  start(): void {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (event.contentChanges.length > 0) {
          this.handleEditorEvent(event.document);
        }
      }),
      vscode.window.onDidChangeActiveTextEditor(() => {
        this.handleEditorEvent();
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.handleEditorEvent(document);
      }),
      vscode.window.onDidChangeTextEditorSelection((event) => {
        this.handleEditorEvent(event.textEditor.document);
      }),
      vscode.window.onDidChangeTextEditorVisibleRanges((event) => {
        this.handleEditorEvent(event.textEditor.document);
      }),
      vscode.window.onDidChangeWindowState((state) => {
        if (state.focused) {
          this.handleEditorEvent();
        } else {
          this.handleInactivity('window-inactive');
        }
      }),
    );

    this.inactivityTimer = setInterval(() => {
      this.runInactivityCheck(Date.now());
    }, 1_000);

    this.handleEditorEvent();
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
    this._onDidChangeStatus.dispose();
  }

  /**
   * Returns a copy of the current activity state.
   *
   * @returns Current activity tracker state.
   */
  getState(): ActivityTrackerState {
    return { ...this.state };
  }

  getStatus(): TrackingStatus {
    return {
      state: this.manuallyPaused ? 'manual' : this.state.isActive ? 'tracking' : this.pauseReason,
      language: this.state.isActive
        ? mapLanguageIdToDisplayName(vscode.window.activeTextEditor?.document.languageId ?? '')
        : null,
    };
  }

  /** Manual pause stays in effect until explicitly resumed. */
  pause(): void {
    this.manuallyPaused = true;
    this.handleInactivity('manual');
  }

  resume(): void {
    if (!this.manuallyPaused) {
      return;
    }
    this.manuallyPaused = false;
    this.handleEditorEvent();
  }

  /**
   * Processes a single activity signal. Exposed for unit tests.
   *
   * @param now - Timestamp of the detected activity.
   */
  handleActivity(now: number = Date.now()): void {
    if (this.manuallyPaused) {
      return;
    }
    const { nextState } = processActivityEvent(this.state, now);
    this.state = nextState;
    this._onActivity.fire();
    this.publishStatus();
  }

  /**
   * Evaluates inactivity and emits {@link onInactivity} when needed.
   *
   * @param now - Current timestamp in milliseconds.
   * @returns Whether an inactivity event was emitted.
   */
  runInactivityCheck(now: number = Date.now()): boolean {
    if (!shouldEmitInactivity(this.state, now, ConfigManager.getInactivityTimeout() * 1000)) {
      return false;
    }

    this.handleInactivity('idle');
    return true;
  }

  private handleInactivity(reason: Exclude<TrackingStatus['state'], 'tracking'>): void {
    this.pauseReason = reason;
    if (this.state.isActive) {
      this.state = applyInactivity(this.state);
      this._onInactivity.fire();
    }
    this.publishStatus();
  }

  private publishStatus(): void {
    const status = this.getStatus();
    if (status.state !== this.lastPublishedStatus?.state
      || status.language !== this.lastPublishedStatus?.language) {
      this.lastPublishedStatus = status;
      this._onDidChangeStatus.fire(status);
    }
  }

  /**
   * Routes a VS Code editor event into the activity handler.
   */
  private handleEditorEvent(document?: vscode.TextDocument): void {
    const editor = vscode.window.activeTextEditor;
    if (this.manuallyPaused) {
      this.handleInactivity('manual');
      return;
    }
    if (!vscode.window.state.focused) {
      this.handleInactivity('window-inactive');
      return;
    }
    if (!editor) {
      this.handleInactivity('no-editor');
      return;
    }

    // Ignore output panes and background edits from other extensions.
    if (editor.document.uri.scheme !== 'file' && editor.document.uri.scheme !== 'untitled'
      && editor.document.uri.scheme !== 'vscode-remote') {
      this.handleInactivity('unsupported-editor');
      return;
    }
    if (document && document.uri.toString() !== editor.document.uri.toString()) {
      return;
    }

    this.handleActivity(Date.now());
  }
}
