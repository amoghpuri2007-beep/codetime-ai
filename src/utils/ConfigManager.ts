import * as vscode from 'vscode';

/**
 * Centralised configuration reader for CodeTime AI.
 * All services should read settings through this class only.
 */
export class ConfigManager {
  private static readonly SECTION = 'codetime';

  /**
   * Reads a configuration value by key.
   *
   * @param key - The setting key (without the "codetime." prefix).
   * @param defaultValue - Fallback value if the setting is not set.
   * @returns The setting value cast to T.
   */
  static get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(ConfigManager.SECTION);
    return config.get<T>(key, defaultValue);
  }

  /** Anthropic API key for AI insight generation. */
  static getApiKey(): string {
    return ConfigManager.get<string>('anthropicApiKey', '');
  }

  /** Seconds of inactivity before the timer pauses. */
  static getInactivityTimeout(): number {
    return ConfigManager.get<number>('inactivityTimeout', 60);
  }

  /** Minimum uninterrupted minutes to qualify as a focus session. */
  static getFocusSessionMinutes(): number {
    return ConfigManager.get<number>('focusSessionMinutes', 25);
  }

  /** Daily coding goal in minutes. */
  static getDailyGoalMinutes(): number {
    return ConfigManager.get<number>('dailyGoalMinutes', 120);
  }

  /** Whether milestone notifications are enabled. */
  static areMilestoneNotificationsEnabled(): boolean {
    return ConfigManager.get<boolean>('enableMilestoneNotifications', true);
  }

  /** Whether focus session notifications are enabled. */
  static areFocusNotificationsEnabled(): boolean {
    return ConfigManager.get<boolean>('enableFocusNotifications', true);
  }

  /**
   * Registers a listener that fires whenever CodeTime settings change.
   *
   * @param callback - Function called with the changed configuration.
   * @returns A disposable to unregister the listener.
   */
  static onChange(
    callback: (e: vscode.ConfigurationChangeEvent) => void,
  ): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ConfigManager.SECTION)) {
        callback(e);
      }
    });
  }
}