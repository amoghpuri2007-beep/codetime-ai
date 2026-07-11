import { WeeklyInsightResponse } from './weeklyData';

/** Error thrown when Claude returns an invalid insight payload. */
export class InsightParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsightParseError';
  }
}

/**
 * Extracts a JSON object from a Claude response body.
 *
 * @param text - Raw model response text.
 * @returns Parsed JSON substring.
 */
export function extractJsonObject(text: string): string {
  const trimmed = text.trim();
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!objectMatch) {
    throw new InsightParseError('Claude did not return a JSON object.');
  }

  return objectMatch[0];
}

/**
 * Validates and normalizes the weekly insight JSON payload.
 *
 * @param value - Parsed JSON value from Claude.
 * @returns Normalized weekly insight response.
 */
export function validateWeeklyInsightResponse(value: unknown): WeeklyInsightResponse {
  if (!value || typeof value !== 'object') {
    throw new InsightParseError('Insight response must be a JSON object.');
  }

  const response = value as WeeklyInsightResponse;

  if (typeof response.summary !== 'string' || response.summary.trim().length === 0) {
    throw new InsightParseError('Insight response is missing a valid summary.');
  }

  if (
    typeof response.productivityScore !== 'number' ||
    response.productivityScore < 0 ||
    response.productivityScore > 100
  ) {
    throw new InsightParseError('Insight response must include productivityScore between 0 and 100.');
  }

  if (!Array.isArray(response.patterns) || response.patterns.length !== 3) {
    throw new InsightParseError('Insight response must include exactly 3 patterns.');
  }

  if (!Array.isArray(response.suggestions) || response.suggestions.length !== 3) {
    throw new InsightParseError('Insight response must include exactly 3 suggestions.');
  }

  if (typeof response.peakHour !== 'string' || response.peakHour.trim().length === 0) {
    throw new InsightParseError('Insight response is missing a valid peakHour.');
  }

  if (typeof response.bestLanguage !== 'string' || response.bestLanguage.trim().length === 0) {
    throw new InsightParseError('Insight response is missing a valid bestLanguage.');
  }

  return {
    summary: response.summary.trim(),
    productivityScore: Math.round(response.productivityScore),
    patterns: response.patterns.map((pattern) => String(pattern).trim()),
    suggestions: response.suggestions.map((suggestion) => String(suggestion).trim()),
    peakHour: response.peakHour.trim(),
    bestLanguage: response.bestLanguage.trim(),
  };
}

/**
 * Parses Claude response text into a validated weekly insight payload.
 *
 * @param text - Raw model response text.
 * @returns Validated weekly insight response.
 */
export function parseWeeklyInsightResponse(text: string): WeeklyInsightResponse {
  const jsonText = extractJsonObject(text);
  const parsed: unknown = JSON.parse(jsonText);
  return validateWeeklyInsightResponse(parsed);
}

/**
 * Converts unknown API errors into user-friendly messages.
 *
 * @param error - Thrown error from the Anthropic API call.
 * @returns Message suitable for display in VS Code notifications.
 */
export function getFriendlyInsightErrorMessage(error: unknown): string {
  if (error instanceof InsightParseError) {
    return `Could not parse the AI insight response. ${error.message}`;
  }

  if (error instanceof Error) {
    if (error.message.includes('401') || error.message.toLowerCase().includes('authentication')) {
      return 'Anthropic API authentication failed. Check your API key in settings.';
    }

    if (error.message.includes('429')) {
      return 'Anthropic API rate limit reached. Please try again later.';
    }

    if (error.message.includes('Missing Anthropic API key')) {
      return 'Anthropic API key is not configured.';
    }

    return `Failed to generate weekly insight: ${error.message}`;
  }

  return 'Failed to generate weekly insight due to an unexpected error.';
}
