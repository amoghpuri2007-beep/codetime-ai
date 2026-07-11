import * as vscode from 'vscode';
import { LanguageStats, SessionRecord } from '../storage/schema';
import { StorageManager } from '../storage/StorageManager';
import { applyLanguageSessionUpdate, mapLanguageIdToDisplayName } from './languageLogic';

/**
 * Tracks active editor language usage and persists language-level session stats.
 */
export class LanguageTracker {
  /**
   * Creates a language tracker backed by local storage.
   *
   * @param storageManager - Storage manager used to read and write language stats.
   */
  constructor(private readonly storageManager: StorageManager) {}

  /**
   * Returns the display name of the active editor language.
   *
   * @returns Mapped language display name for the active text editor.
   */
  getCurrentLanguage(): string {
    const languageId = vscode.window.activeTextEditor?.document.languageId ?? 'unknown';
    return mapLanguageIdToDisplayName(languageId);
  }

  /**
   * Maps a VS Code language id to a display name. Exposed for unit tests.
   *
   * @param languageId - VS Code document language id.
   * @returns Human-readable language display name.
   */
  mapLanguageId(languageId: string): string {
    return mapLanguageIdToDisplayName(languageId);
  }

  /**
   * Updates stored language stats when a coding session ends.
   *
   * @param session - Completed session record to merge into language stats.
   */
  onSessionEnd(session: SessionRecord): void {
    const data = this.storageManager.read();
    data.languages = applyLanguageSessionUpdate(data.languages, session);
    this.storageManager.write(data);
  }

  /**
   * Returns all persisted language stats.
   *
   * @returns Language stats loaded from storage.
   */
  getStats(): LanguageStats[] {
    return Object.values(this.storageManager.read().languages);
  }
}
