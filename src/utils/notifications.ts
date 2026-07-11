import * as vscode from 'vscode';
import { StorageManager } from '../storage/StorageManager';
import { applyDailyMilestoneUpdates } from './milestoneLogic';

/** Notification shown when a focus session is completed. */
export const FOCUS_SESSION_COMPLETE_MESSAGE =
  '🎯 Focus session complete! 25 minutes of deep work logged.';

type NotificationHandler = (message: string) => Thenable<string | undefined>;

/**
 * Shows the focus session completion notification.
 *
 * @param showNotification - Optional VS Code notification handler for testing.
 */
export function notifyFocusSessionComplete(
  showNotification: NotificationHandler = vscode.window.showInformationMessage,
): void {
  void showNotification(FOCUS_SESSION_COMPLETE_MESSAGE);
}

/**
 * Checks today's coding milestones and fires any newly reached notifications.
 *
 * @param storageManager - Storage manager used to read and persist milestone state.
 * @param showNotification - Optional VS Code notification handler for testing.
 * @returns Messages that were displayed during this check.
 */
export function processDailyMilestones(
  storageManager: StorageManager,
  showNotification: NotificationHandler = vscode.window.showInformationMessage,
): string[] {
  const data = storageManager.read();
  const today = storageManager.getTodayDateKey();
  const daily = data.daily[today] ?? storageManager.createEmptyDailyStats(today);
  const { daily: updatedDaily, messages } = applyDailyMilestoneUpdates(
    daily,
    daily.totalSeconds,
  );

  if (messages.length === 0) {
    return [];
  }

  data.daily[today] = updatedDaily;
  storageManager.write(data);

  for (const message of messages) {
    void showNotification(message);
  }

  return messages;
}
