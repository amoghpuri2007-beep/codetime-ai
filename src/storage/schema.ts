export interface SessionRecord {
  id: string;
  startTime: string; // ISO timestamp
  endTime: string;
  durationSeconds: number;
  language: string;
  projectName: string;
  projectPath: string;
  branch: string;
  isFocusSession: boolean; // true if 25+ min uninterrupted
}

export interface ProjectStats {
  projectName: string;
  projectPath: string;
  totalSeconds: number;
  lastOpened: string;
  sessions: SessionRecord[];
  languages: Record<string, number>; // language -> seconds
}

export interface LanguageStats {
  language: string;
  totalSeconds: number;
  percentage: number;
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  totalSeconds: number;
  focusSessions: number;
  sessions: SessionRecord[];
  firedMilestones: string[]; // milestone keys notified today
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string;
  streakHistory: string[]; // array of active dates
}

export interface AIInsight {
  generatedAt: string;
  weekOf: string;
  summary: string;
  productivityScore: number; // 0-100
  patterns: string[];
  suggestions: string[];
  peakHour: string;
  bestLanguage: string;
}

export interface RootStorage {
  version: string;
  projects: Record<string, ProjectStats>;
  languages: Record<string, LanguageStats>;
  daily: Record<string, DailyStats>;
  streak: StreakData;
  insights: AIInsight[];
}
