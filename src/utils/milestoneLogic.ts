import { DailyStats } from '../storage/schema';

/** Daily coding milestone definition. */
export interface DailyMilestone {
  /** Unique milestone key based on the seconds threshold. */
  key: string;
  /** Seconds threshold required to unlock the milestone. */
  seconds: number;
  /** Notification message shown when the milestone is reached. */
  message: string;
}

/** Daily coding milestones that trigger one-time notifications. */
export const DAILY_MILESTONES: DailyMilestone[] = [
  {
    key: '1800',
    seconds: 1800,
    message: '🔥 30-minute streak maintained!',
  },
  {
    key: '3600',
    seconds: 3600,
    message: '⚡ 1 hour of coding today!',
  },
  {
    key: '7200',
    seconds: 7200,
    message: '🚀 2 hours! You\'re in the zone.',
  },
  {
    key: '18000',
    seconds: 18000,
    message: '💻 5 hours today. Legendary session.',
  },
];

/**
 * Returns milestones that have been reached but not yet marked as fired.
 *
 * @param totalSeconds - Total coding seconds logged today.
 * @param firedMilestones - Milestone keys already notified today.
 * @returns Newly eligible milestones in ascending threshold order.
 */
export function getNewlyEligibleMilestones(
  totalSeconds: number,
  firedMilestones: string[],
): DailyMilestone[] {
  const firedSet = new Set(firedMilestones);

  return DAILY_MILESTONES.filter(
    (milestone) => totalSeconds >= milestone.seconds && !firedSet.has(milestone.key),
  );
}

/**
 * Marks newly reached milestones as fired on the daily stats record.
 *
 * @param daily - Daily stats for the current date.
 * @param totalSeconds - Total coding seconds logged today.
 * @returns Milestone messages to display and the updated daily stats record.
 */
export function applyDailyMilestoneUpdates(
  daily: DailyStats,
  totalSeconds: number,
): { daily: DailyStats; messages: string[] } {
  const firedMilestones = daily.firedMilestones ?? [];
  const eligibleMilestones = getNewlyEligibleMilestones(totalSeconds, firedMilestones);

  if (eligibleMilestones.length === 0) {
    return { daily, messages: [] };
  }

  return {
    daily: {
      ...daily,
      firedMilestones: [
        ...firedMilestones,
        ...eligibleMilestones.map((milestone) => milestone.key),
      ],
    },
    messages: eligibleMilestones.map((milestone) => milestone.message),
  };
}
