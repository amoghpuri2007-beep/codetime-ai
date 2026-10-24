import { AIInsight, RootStorage, SessionRecord } from '../storage/schema';
import { StorageManager } from '../storage/StorageManager';
import { calculatePeakCodingHour } from '../ai/weeklyStats';
import { formatDurationShort } from '../utils/timeUtils';
import { ConfigManager } from '../utils/ConfigManager';

/** Dashboard payload sent from the extension to the webview. */
export interface DashboardPayload {
  streak: {
    current: number;
    longest: number;
  };
  stats: {
    today: string;
    week: string;
    total: string;
    focusSessions: number;
  };
  goal: {
    todaySeconds: number;
    targetSeconds: number;
    percentage: number;
    label: string;
  };
  peakHour: string;
  insight: AIInsight | null;
  languages: Array<{
    language: string;
    seconds: number;
    percentage: number;
  }>;
  weeklyActivity: Array<{
    day: string;
    hours: number;
  }>;
  dailyTrend: Array<{
    date: string;
    label: string;
    hours: number;
  }>;
  topProjects: Array<{
    name: string;
    seconds: number;
    label: string;
  }>;
  recentSessions: Array<{
    date: string;
    project: string;
    language: string;
    duration: string;
    focus: boolean;
  }>;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const TREND_DAYS = 14;

/**
 * Formats an ISO date string for display in the sessions table.
 *
 * @param isoTimestamp - ISO timestamp string.
 * @returns Short local date label.
 */
export function formatSessionDate(isoTimestamp: string): string {
  const parsed = new Date(isoTimestamp);
  if (Number.isNaN(parsed.getTime())) {
    return isoTimestamp;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Builds the last N days of daily trend data ending today.
 *
 * @param storageManager - Storage manager used to read daily stats.
 * @param days - Number of days to include.
 * @returns Daily trend points with labels and hours.
 */
export function buildDailyTrend(
  storageManager: StorageManager,
  days: number = TREND_DAYS,
  data: RootStorage = storageManager.read(),
): DashboardPayload['dailyTrend'] {
  const trend: DashboardPayload['dailyTrend'] = [];
  const today = new Date();

  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const dateKey = storageManager.formatDateKey(date);
    const daily = data.daily[dateKey];
    const totalSeconds = daily?.totalSeconds ?? 0;

    trend.push({
      date: dateKey,
      label: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      hours: totalSeconds / 3600,
    });
  }

  return trend;
}

/**
 * Collects recent sessions sorted by end time descending.
 *
 * @param storageManager - Storage manager used to read session history.
 * @param limit - Maximum number of sessions to return.
 * @returns Recent session rows for the dashboard table.
 */
export function getRecentSessions(
  storageManager: StorageManager,
  limit: number = 20,
  data: RootStorage = storageManager.read(),
): DashboardPayload['recentSessions'] {
  const sessions: SessionRecord[] = [];

  for (const daily of Object.values(data.daily)) {
    sessions.push(...daily.sessions);
  }

  return sessions
    .sort((left, right) => right.endTime.localeCompare(left.endTime))
    .slice(0, limit)
    .map((session) => ({
      date: formatSessionDate(session.endTime),
      project: session.projectName,
      language: session.language,
      duration: formatDurationShort(session.durationSeconds),
      focus: session.isFocusSession,
    }));
}

/**
 * Builds the dashboard payload from persisted and in-progress activity.
 *
 * @param storageManager - Storage manager used to read stats and insights.
 * @param latestInsight - Latest AI insight, if available.
 * @returns Dashboard payload for the webview.
 */
export function buildDashboardPayload(
  storageManager: StorageManager,
  latestInsight: AIInsight | null,
  liveSession: SessionRecord | null = null,
): DashboardPayload {
  const data = storageManager.getSnapshot(liveSession);
  const weekStats = storageManager.getThisWeekStats(data);
  const todayStats = storageManager.getTodayStats(data);
  const streak = data.streak;
  const targetSeconds = Math.max(1, ConfigManager.getDailyGoalMinutes()) * 60;

  const weekSeconds = weekStats.reduce((sum, daily) => sum + daily.totalSeconds, 0);
  const totalSeconds = Object.values(data.daily).reduce(
    (sum, daily) => sum + daily.totalSeconds,
    0,
  );
  const focusSessions = Object.values(data.daily).reduce(
    (sum, daily) => sum + daily.focusSessions,
    0,
  );

  const languages = Object.values(data.languages)
    .sort((left, right) => right.totalSeconds - left.totalSeconds)
    .map((language) => ({
      language: language.language,
      seconds: language.totalSeconds,
      percentage: language.percentage,
    }));

  const topProjects = Object.values(data.projects)
    .sort((left, right) => right.totalSeconds - left.totalSeconds)
    .slice(0, 5)
    .map((project) => ({
      name: project.projectName,
      seconds: project.totalSeconds,
      label: formatDurationShort(project.totalSeconds),
    }));

  return {
    streak: {
      current: streak.currentStreak,
      longest: streak.longestStreak,
    },
    stats: {
      today: formatDurationShort(todayStats.totalSeconds),
      week: formatDurationShort(weekSeconds),
      total: formatDurationShort(totalSeconds),
      focusSessions,
    },
    goal: {
      todaySeconds: todayStats.totalSeconds,
      targetSeconds,
      percentage: Math.min(100, (todayStats.totalSeconds / targetSeconds) * 100),
      label: `${formatDurationShort(todayStats.totalSeconds)} / ${formatDurationShort(targetSeconds)}`,
    },
    peakHour: calculatePeakCodingHour(weekStats),
    insight: latestInsight,
    languages,
    weeklyActivity: weekStats.map((daily, index) => ({
      day: DAY_NAMES[index] ?? daily.date,
      hours: daily.totalSeconds / 3600,
    })),
    dailyTrend: buildDailyTrend(storageManager, TREND_DAYS, data),
    topProjects,
    recentSessions: getRecentSessions(storageManager, 20, data),
  };
}
