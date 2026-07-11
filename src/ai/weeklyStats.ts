import { DailyStats } from '../storage/schema';
import { StorageManager } from '../storage/StorageManager';
import {
  WeeklyData,
  WeeklyDayBreakdown,
  WeeklyLanguageEntry,
  WeeklyProjectEntry,
} from './weeklyData';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Formats seconds as hours rounded to one decimal place.
 *
 * @param totalSeconds - Duration in seconds.
 * @returns Hours as a decimal number.
 */
export function secondsToHours(totalSeconds: number): number {
  return Math.round((totalSeconds / 3600) * 10) / 10;
}

/**
 * Formats an hour index as a readable time range label.
 *
 * @param hour - Hour of day from 0 to 23.
 * @returns Label such as {@code 9 PM - 10 PM}.
 */
export function formatHourRange(hour: number): string {
  const formatHour = (value: number): string => {
    const period = value >= 12 ? 'PM' : 'AM';
    const display = value % 12 === 0 ? 12 : value % 12;
    return `${display} ${period}`;
  };

  const nextHour = (hour + 1) % 24;
  return `${formatHour(hour)} - ${formatHour(nextHour)}`;
}

/**
 * Aggregates language totals from weekly sessions.
 *
 * @param weekStats - Daily stats for the current week.
 * @param limit - Maximum number of languages to return.
 * @returns Top languages sorted by total seconds descending.
 */
export function getTopLanguages(
  weekStats: DailyStats[],
  limit: number = 3,
): WeeklyLanguageEntry[] {
  const totals = new Map<string, number>();

  for (const daily of weekStats) {
    for (const session of daily.sessions) {
      totals.set(session.language, (totals.get(session.language) ?? 0) + session.durationSeconds);
    }
  }

  return Array.from(totals.entries())
    .map(([language, totalSeconds]) => ({ language, totalSeconds }))
    .sort((left, right) => right.totalSeconds - left.totalSeconds)
    .slice(0, limit);
}

/**
 * Aggregates project totals from weekly sessions.
 *
 * @param weekStats - Daily stats for the current week.
 * @param limit - Maximum number of projects to return.
 * @returns Top projects sorted by total seconds descending.
 */
export function getTopProjects(
  weekStats: DailyStats[],
  limit: number = 3,
): WeeklyProjectEntry[] {
  const totals = new Map<string, number>();

  for (const daily of weekStats) {
    for (const session of daily.sessions) {
      totals.set(
        session.projectName,
        (totals.get(session.projectName) ?? 0) + session.durationSeconds,
      );
    }
  }

  return Array.from(totals.entries())
    .map(([projectName, totalSeconds]) => ({ projectName, totalSeconds }))
    .sort((left, right) => right.totalSeconds - left.totalSeconds)
    .slice(0, limit);
}

/**
 * Finds the hour of day with the most coding activity this week.
 *
 * @param weekStats - Daily stats for the current week.
 * @returns Formatted peak hour range or {@code No activity} when empty.
 */
export function calculatePeakCodingHour(weekStats: DailyStats[]): string {
  const hourTotals = new Array<number>(24).fill(0);

  for (const daily of weekStats) {
    for (const session of daily.sessions) {
      const hour = new Date(session.startTime).getHours();
      if (!Number.isNaN(hour)) {
        hourTotals[hour] += session.durationSeconds;
      }
    }
  }

  let peakHour = 0;
  let peakSeconds = 0;

  for (let hour = 0; hour < hourTotals.length; hour++) {
    if (hourTotals[hour] > peakSeconds) {
      peakSeconds = hourTotals[hour];
      peakHour = hour;
    }
  }

  if (peakSeconds === 0) {
    return 'No activity';
  }

  return formatHourRange(peakHour);
}

/**
 * Builds daily breakdown rows for Monday through Sunday.
 *
 * @param weekStats - Daily stats for the current week.
 * @returns Ordered daily breakdown with day labels and hours.
 */
export function buildDailyBreakdown(weekStats: DailyStats[]): WeeklyDayBreakdown[] {
  return weekStats.map((daily, index) => ({
    day: DAY_NAMES[index] ?? daily.date,
    date: daily.date,
    hours: secondsToHours(daily.totalSeconds),
    totalSeconds: daily.totalSeconds,
  }));
}

/**
 * Builds weekly insight input data from persisted storage.
 *
 * @param storageManager - Storage manager used to read weekly stats.
 * @returns Aggregated weekly coding data for prompt generation.
 */
export function buildWeeklyData(storageManager: StorageManager): WeeklyData {
  const data = storageManager.read();
  const weekStats = storageManager.getThisWeekStats();
  const totalSeconds = weekStats.reduce((sum, daily) => sum + daily.totalSeconds, 0);
  const focusSessionCount = weekStats.reduce((sum, daily) => sum + daily.focusSessions, 0);

  return {
    weekOf: weekStats[0]?.date ?? storageManager.getTodayDateKey(),
    totalSeconds,
    dailyBreakdown: buildDailyBreakdown(weekStats),
    topLanguages: getTopLanguages(weekStats),
    topProjects: getTopProjects(weekStats),
    focusSessionCount,
    peakCodingHour: calculatePeakCodingHour(weekStats),
    currentStreak: data.streak.currentStreak,
  };
}

/**
 * Formats seconds as a human-readable duration label.
 *
 * @param totalSeconds - Duration in seconds.
 * @returns Label such as {@code 2h 15m}.
 */
export function formatWeeklyDuration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  return `${minutes}m`;
}
