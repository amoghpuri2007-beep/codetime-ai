import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import {
  AIInsight,
  DailyStats,
  RootStorage,
  SessionRecord,
  StreakData,
} from './schema';
import { applyStreakUpdate, computeEffectiveStreak } from './streakLogic';

export const STORAGE_VERSION = '1.0.0';
const STORAGE_FILENAME = 'codetime-storage.json';

export class StorageManager {
  private readonly storageFilePath: string;
  private cached: RootStorage | null = null;

  constructor(globalStorageUri: vscode.Uri) {
    this.storageFilePath = path.join(globalStorageUri.fsPath, STORAGE_FILENAME);
  }

  read(): RootStorage {
    if (this.cached !== null) {
      return this.cached;
    }

    try {
      if (!fs.existsSync(this.storageFilePath)) {
        this.cached = this.getDefault();
        return this.cached;
      }

      const raw = fs.readFileSync(this.storageFilePath, 'utf8');
      const parsed: unknown = JSON.parse(raw);

      if (!this.isValidRootStorage(parsed)) {
        console.error('[CodeTime AI] Storage file has an invalid schema. Resetting to defaults.');
        this.cached = this.getDefault();
        return this.cached;
      }

      this.cached = this.migrateRootStorage(parsed);
      return this.cached;
    } catch (error) {
      console.error('[CodeTime AI] Failed to read storage file. Using defaults.', error);
      this.cached = this.getDefault();
      return this.cached;
    }
  }

  write(data: RootStorage): void {
    try {
      fs.mkdirSync(path.dirname(this.storageFilePath), { recursive: true });
      fs.writeFileSync(this.storageFilePath, JSON.stringify(data, null, 2), 'utf8');
      this.cached = data;
    } catch (error) {
      console.error('[CodeTime AI] Failed to write storage file.', error);
      throw error;
    }
  }

  getDefault(): RootStorage {
    return {
      version: STORAGE_VERSION,
      projects: {},
      languages: {},
      daily: {},
      streak: {
        currentStreak: 0,
        longestStreak: 0,
        lastActiveDate: '',
        streakHistory: [],
      },
      insights: [],
    };
  }

  /**
   * Persists a session into daily stats and updates streak tracking.
   *
   * @param session - Completed session record to save.
   */
  updateDaily(session: SessionRecord): void {
    const data = this.read();
    const dateKey = this.getDateKey(session.startTime);

    this.updateDailyStats(data, dateKey, session);

    const today = this.getTodayDateKey();
    const todayDaily = data.daily[today] ?? this.createEmptyDailyStats(today);
    data.streak = this.updateStreak(data.streak, today, todayDaily.totalSeconds);

    this.write(data);
  }

  getThisWeekStats(): DailyStats[] {
    const data = this.read();
    const weekStart = this.getStartOfWeek(new Date());
    const stats: DailyStats[] = [];

    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      const dateKey = this.formatDateLocal(day);
      stats.push(data.daily[dateKey] ?? this.createEmptyDailyStats(dateKey));
    }

    return stats;
  }

  getTodayStats(): DailyStats {
    const data = this.read();
    const today = this.getTodayDateKey();
    return data.daily[today] ?? this.createEmptyDailyStats(today);
  }

  /**
   * Appends a generated insight to storage.
   *
   * @param insight - Weekly insight to persist.
   */
  saveInsight(insight: AIInsight): void {
    const data = this.read();
    data.insights.push(insight);
    this.write(data);
  }

  /**
   * Returns the most recently generated insight.
   *
   * @returns Latest insight sorted by {@code generatedAt}, or null when none exist.
   */
  getLatestInsight(): AIInsight | null {
    const insights = this.read().insights;
    if (insights.length === 0) {
      return null;
    }

    return [...insights].sort((left, right) => {
      return right.generatedAt.localeCompare(left.generatedAt);
    })[0];
  }

  /**
   * Returns streak data with missed-day resets applied.
   *
   * @returns Current streak data persisted to storage when a reset is required.
   */
  getStreakData(): StreakData {
    const data = this.read();
    const today = this.getTodayDateKey();
    const refreshed = computeEffectiveStreak(data.streak, today);

    if (refreshed.currentStreak !== data.streak.currentStreak) {
      data.streak = refreshed;
      this.write(data);
    }

    return refreshed;
  }

  /**
   * Formats a date as a YYYY-MM-DD storage key.
   *
   * @param date - Date to format.
   * @returns Local date key.
   */
  formatDateKey(date: Date): string {
    return this.formatDateLocal(date);
  }

  /**
   * Returns today's date key in YYYY-MM-DD format.
   *
   * @returns Local date key for the current day.
   */
  getTodayDateKey(): string {
    return this.formatDateLocal(new Date());
  }

  /**
   * Creates an empty daily stats record for the supplied date.
   *
   * @param date - Date key in YYYY-MM-DD format.
   * @returns Empty daily stats object.
   */
  createEmptyDailyStats(date: string): DailyStats {
    return {
      date,
      totalSeconds: 0,
      focusSessions: 0,
      sessions: [],
      firedMilestones: [],
    };
  }

  private updateDailyStats(data: RootStorage, dateKey: string, session: SessionRecord): void {
    const daily = data.daily[dateKey] ?? this.createEmptyDailyStats(dateKey);

    daily.sessions.push(session);
    daily.totalSeconds += session.durationSeconds;
    if (session.isFocusSession) {
      daily.focusSessions += 1;
    }

    data.daily[dateKey] = daily;
  }

  /**
   * Applies streak rules using today's accumulated coding time.
   *
   * @param streak - Current streak data.
   * @param todayDate - Today's date key.
   * @param todayTotalSeconds - Total seconds coded today.
   * @returns Updated streak data.
   */
  updateStreak(
    streak: StreakData,
    todayDate: string,
    todayTotalSeconds: number,
  ): StreakData {
    return applyStreakUpdate(streak, todayDate, todayTotalSeconds);
  }

  private migrateRootStorage(data: RootStorage): RootStorage {
    for (const [dateKey, daily] of Object.entries(data.daily)) {
      data.daily[dateKey] = {
        ...daily,
        firedMilestones: daily.firedMilestones ?? [],
      };
    }

    return data;
  }

  private getDateKey(isoTimestamp: string): string {
    const parsed = new Date(isoTimestamp);
    if (Number.isNaN(parsed.getTime())) {
      return this.formatDateLocal(new Date());
    }
    return this.formatDateLocal(parsed);
  }

  private formatDateLocal(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getStartOfWeek(date: Date): Date {
    const start = new Date(date);
    const dayOfWeek = start.getDay();
    const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    start.setDate(start.getDate() + diff);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  private isValidRootStorage(data: unknown): data is RootStorage {
    if (!data || typeof data !== 'object') {
      return false;
    }

    const root = data as RootStorage;

    return (
      typeof root.version === 'string' &&
      root.projects !== null &&
      typeof root.projects === 'object' &&
      root.languages !== null &&
      typeof root.languages === 'object' &&
      root.daily !== null &&
      typeof root.daily === 'object' &&
      root.streak !== null &&
      typeof root.streak === 'object' &&
      typeof root.streak.currentStreak === 'number' &&
      typeof root.streak.longestStreak === 'number' &&
      typeof root.streak.lastActiveDate === 'string' &&
      Array.isArray(root.streak.streakHistory) &&
      Array.isArray(root.insights) &&
      root.insights.every((insight) => this.isValidInsight(insight))
    );
  }

  private isValidInsight(insight: AIInsight): boolean {
    return (
      typeof insight.generatedAt === 'string' &&
      typeof insight.weekOf === 'string' &&
      typeof insight.summary === 'string' &&
      typeof insight.productivityScore === 'number' &&
      Array.isArray(insight.patterns) &&
      Array.isArray(insight.suggestions) &&
      typeof insight.peakHour === 'string' &&
      typeof insight.bestLanguage === 'string'
    );
  }
}
