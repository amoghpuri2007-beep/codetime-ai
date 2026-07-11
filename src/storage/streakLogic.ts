import { StreakData } from './schema';

/** Minimum daily coding time required to maintain or advance a streak (30 minutes). */
export const STREAK_THRESHOLD_SECONDS = 1800;

/**
 * Determines whether {@code previousDate} is exactly one calendar day before {@code todayDate}.
 *
 * @param previousDate - Earlier date in YYYY-MM-DD format.
 * @param todayDate - Current date in YYYY-MM-DD format.
 * @returns True when {@code previousDate} is yesterday relative to {@code todayDate}.
 */
export function isYesterday(previousDate: string, todayDate: string): boolean {
  const today = new Date(`${todayDate}T00:00:00`);
  const expectedYesterday = new Date(today);
  expectedYesterday.setDate(today.getDate() - 1);

  const year = expectedYesterday.getFullYear();
  const month = String(expectedYesterday.getMonth() + 1).padStart(2, '0');
  const day = String(expectedYesterday.getDate()).padStart(2, '0');
  const yesterdayKey = `${year}-${month}-${day}`;

  return previousDate === yesterdayKey;
}

/**
 * Applies streak rules after a session save.
 *
 * Streak advances only when today's total coding time reaches 30 minutes.
 *
 * @param streak - Current streak data from storage.
 * @param todayDate - Today's date in YYYY-MM-DD format.
 * @param todayTotalSeconds - Total coding seconds logged today.
 * @returns Updated streak data.
 */
export function applyStreakUpdate(
  streak: StreakData,
  todayDate: string,
  todayTotalSeconds: number,
): StreakData {
  if (todayTotalSeconds < STREAK_THRESHOLD_SECONDS) {
    return streak;
  }

  const nextStreak: StreakData = {
    ...streak,
    streakHistory: [...streak.streakHistory],
  };

  if (nextStreak.lastActiveDate === todayDate) {
    // Already counted today — no streak change.
  } else if (
    nextStreak.lastActiveDate === '' ||
    isYesterday(nextStreak.lastActiveDate, todayDate)
  ) {
    nextStreak.currentStreak =
      nextStreak.lastActiveDate === '' ? 1 : nextStreak.currentStreak + 1;
  } else {
    nextStreak.currentStreak = 1;
  }

  nextStreak.lastActiveDate = todayDate;
  nextStreak.longestStreak = Math.max(nextStreak.longestStreak, nextStreak.currentStreak);

  if (!nextStreak.streakHistory.includes(todayDate)) {
    nextStreak.streakHistory.push(todayDate);
    nextStreak.streakHistory.sort();
  }

  return nextStreak;
}

/**
 * Applies missed-day streak reset rules for display and persistence.
 *
 * If the last qualifying day was before yesterday, the current streak is reset to zero.
 *
 * @param streak - Current streak data from storage.
 * @param todayDate - Today's date in YYYY-MM-DD format.
 * @returns Streak data with an effective current streak value.
 */
export function computeEffectiveStreak(streak: StreakData, todayDate: string): StreakData {
  if (!streak.lastActiveDate) {
    return {
      ...streak,
      currentStreak: 0,
    };
  }

  if (
    streak.lastActiveDate === todayDate ||
    isYesterday(streak.lastActiveDate, todayDate)
  ) {
    return streak;
  }

  return {
    ...streak,
    currentStreak: 0,
  };
}
