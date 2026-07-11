/** Daily coding breakdown for a single day of the week. */
export interface WeeklyDayBreakdown {
  day: string;
  date: string;
  hours: number;
  totalSeconds: number;
}

/** Language usage entry for weekly rankings. */
export interface WeeklyLanguageEntry {
  language: string;
  totalSeconds: number;
}

/** Project usage entry for weekly rankings. */
export interface WeeklyProjectEntry {
  projectName: string;
  totalSeconds: number;
}

/** Aggregated coding statistics for the current calendar week. */
export interface WeeklyData {
  weekOf: string;
  totalSeconds: number;
  dailyBreakdown: WeeklyDayBreakdown[];
  topLanguages: WeeklyLanguageEntry[];
  topProjects: WeeklyProjectEntry[];
  focusSessionCount: number;
  peakCodingHour: string;
  currentStreak: number;
}

/** JSON payload returned by Claude for weekly insights. */
export interface WeeklyInsightResponse {
  summary: string;
  productivityScore: number;
  patterns: string[];
  suggestions: string[];
  peakHour: string;
  bestLanguage: string;
}
