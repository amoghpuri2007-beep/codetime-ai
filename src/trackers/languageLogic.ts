import { LanguageStats, SessionRecord } from '../storage/schema';

/** Explicit display-name overrides for VS Code language ids. */
export const LANGUAGE_DISPLAY_OVERRIDES: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  cpp: 'C++',
  typescriptreact: 'TypeScript (React)',
  javascriptreact: 'JavaScript (React)',
};

/**
 * Maps a VS Code language id to a human-readable display name.
 *
 * @param languageId - VS Code document language id.
 * @returns Mapped display name using overrides or title case.
 */
export function mapLanguageIdToDisplayName(languageId: string): string {
  const override = LANGUAGE_DISPLAY_OVERRIDES[languageId];
  if (override) {
    return override;
  }

  if (!languageId) {
    return 'Unknown';
  }

  return languageId
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Recalculates language percentage values across all tracked languages.
 *
 * @param languages - Current language stats map.
 * @returns Updated language stats with refreshed percentages.
 */
export function recalculateLanguagePercentages(
  languages: Record<string, LanguageStats>,
): Record<string, LanguageStats> {
  const totalSeconds = Object.values(languages).reduce(
    (sum, language) => sum + language.totalSeconds,
    0,
  );

  const updated: Record<string, LanguageStats> = {};

  for (const [key, language] of Object.entries(languages)) {
    updated[key] = {
      ...language,
      percentage:
        totalSeconds > 0
          ? Math.round((language.totalSeconds / totalSeconds) * 10000) / 100
          : 0,
    };
  }

  return updated;
}

/**
 * Applies language stats updates for a completed session.
 *
 * @param languages - Current language stats map from storage.
 * @param session - Completed session record.
 * @returns Updated language stats map with recalculated percentages.
 */
export function applyLanguageSessionUpdate(
  languages: Record<string, LanguageStats>,
  session: SessionRecord,
): Record<string, LanguageStats> {
  const key = session.language;
  const existing = languages[key];

  const nextLanguages: Record<string, LanguageStats> = {
    ...languages,
    [key]: {
      language: session.language,
      totalSeconds: (existing?.totalSeconds ?? 0) + session.durationSeconds,
      percentage: existing?.percentage ?? 0,
    },
  };

  return recalculateLanguagePercentages(nextLanguages);
}
