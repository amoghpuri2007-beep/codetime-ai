import { WeeklyData } from './weeklyData';
import { formatWeeklyDuration } from './weeklyStats';

/**
 * Builds the Claude prompt for generating a weekly coding insight.
 *
 * @param stats - Aggregated weekly coding statistics.
 * @returns Prompt instructing Claude to return only valid JSON.
 */
export function buildWeeklyInsightPrompt(stats: WeeklyData): string {
  const totalTime = formatWeeklyDuration(stats.totalSeconds);
  const dailyLines = stats.dailyBreakdown
    .map((day) => `- ${day.day}: ${day.hours} hours`)
    .join('\n');

  const languageLines =
    stats.topLanguages.length > 0
      ? stats.topLanguages
          .map(
            (entry, index) =>
              `${index + 1}. ${entry.language} — ${formatWeeklyDuration(entry.totalSeconds)}`,
          )
          .join('\n')
      : 'No language data recorded this week.';

  const projectLines =
    stats.topProjects.length > 0
      ? stats.topProjects
          .map(
            (entry, index) =>
              `${index + 1}. ${entry.projectName} — ${formatWeeklyDuration(entry.totalSeconds)}`,
          )
          .join('\n')
      : 'No project data recorded this week.';

  return `You are a productivity coach analyzing a developer's weekly coding activity.

Here is this week's coding data (week starting ${stats.weekOf}):

TOTAL CODING TIME THIS WEEK
- ${totalTime}

DAILY BREAKDOWN (Mon-Sun)
${dailyLines}

TOP 3 LANGUAGES
${languageLines}

TOP 3 PROJECTS
${projectLines}

FOCUS SESSIONS
- ${stats.focusSessionCount} focus sessions completed (25+ minutes of uninterrupted deep work)

PEAK CODING HOUR
- ${stats.peakCodingHour}

CURRENT STREAK
- ${stats.currentStreak} day(s)

Based on this data, provide a concise weekly insight for the developer.

Return ONLY valid JSON with this exact shape and no additional text:

{
  "summary": "string (2-3 sentences)",
  "productivityScore": number (0-100),
  "patterns": ["string", "string", "string"],
  "suggestions": ["string", "string", "string"],
  "peakHour": "string (e.g. '9 PM - 10 PM')",
  "bestLanguage": "string"
}`;
}
