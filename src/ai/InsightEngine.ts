import Anthropic from '@anthropic-ai/sdk';
import * as vscode from 'vscode';
import { AIInsight } from '../storage/schema';
import { StorageManager } from '../storage/StorageManager';
import {
  getFriendlyInsightErrorMessage,
  parseWeeklyInsightResponse,
} from './insightLogic';
import { buildWeeklyInsightPrompt } from './PromptBuilder';
import { buildWeeklyData } from './weeklyStats';

/** Anthropic model used for weekly insight generation. */
export const INSIGHT_MODEL = 'claude-sonnet-4-6';

/** VS Code settings key for the Anthropic API key. */
export const ANTHROPIC_API_KEY_SETTING = 'codetime.anthropicApiKey';

/** Error thrown when the Anthropic API key is missing. */
export class MissingApiKeyError extends Error {
  constructor() {
    super('Missing Anthropic API key');
    this.name = 'MissingApiKeyError';
  }
}

type MessageClient = {
  messages: {
    create: (request: {
      model: string;
      max_tokens: number;
      messages: Array<{ role: 'user'; content: string }>;
    }) => Promise<{
      content: Array<{ type: string; text?: string }>;
    }>;
  };
};

/**
 * Generates and persists AI-powered weekly coding insights.
 */
export class InsightEngine {
  /**
   * Creates an insight engine backed by local storage.
   *
   * @param storageManager - Storage manager used to read stats and save insights.
   * @param createClient - Optional Anthropic client factory for testing.
   */
  constructor(
    private readonly storageManager: StorageManager,
    private readonly createClient: (apiKey: string) => MessageClient = (apiKey) =>
      new Anthropic({ apiKey }) as unknown as MessageClient,
  ) {}

  /**
   * Generates a weekly insight using Claude and saves it to storage.
   *
   * @returns Newly generated weekly insight.
   */
  async generateWeeklyInsight(): Promise<AIInsight> {
    const apiKey = this.getApiKey();
    const weeklyData = buildWeeklyData(this.storageManager);
    const prompt = buildWeeklyInsightPrompt(weeklyData);
    const client = this.createClient(apiKey);

    const response = await client.messages.create({
      model: INSIGHT_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = response.content
      .filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text ?? '')
      .join('\n')
      .trim();

    if (!responseText) {
      throw new Error('Claude returned an empty response.');
    }

    const parsed = parseWeeklyInsightResponse(responseText);
    const insight: AIInsight = {
      generatedAt: new Date().toISOString(),
      weekOf: weeklyData.weekOf,
      summary: parsed.summary,
      productivityScore: parsed.productivityScore,
      patterns: parsed.patterns,
      suggestions: parsed.suggestions,
      peakHour: parsed.peakHour,
      bestLanguage: parsed.bestLanguage,
    };

    this.storageManager.saveInsight(insight);
    return insight;
  }

  /**
   * Reads the Anthropic API key from VS Code settings.
   *
   * @returns Configured Anthropic API key.
   */
  getApiKey(): string {
    const apiKey = vscode.workspace
      .getConfiguration('codetime')
      .get<string>(ANTHROPIC_API_KEY_SETTING, '')
      .trim();

    if (apiKey.length > 0) {
      return apiKey;
    }

    void vscode.window
      .showErrorMessage(
        'CodeTime AI: Anthropic API key is not configured. Add it in settings to generate weekly insights.',
        'Open Settings',
      )
      .then((selection) => {
        if (selection === 'Open Settings') {
          void vscode.commands.executeCommand(
            'workbench.action.openSettings',
            ANTHROPIC_API_KEY_SETTING,
          );
        }
      });

    throw new MissingApiKeyError();
  }

  /**
   * Returns the most recently generated insight, if any.
   *
   * @returns Latest saved insight or null.
   */
  getLatestInsight(): AIInsight | null {
    return this.storageManager.getLatestInsight();
  }

  /**
   * Converts an unknown error into a user-friendly insight error message.
   *
   * @param error - Error thrown during insight generation.
   * @returns Message suitable for VS Code notifications.
   */
  getFriendlyErrorMessage(error: unknown): string {
    return getFriendlyInsightErrorMessage(error);
  }
}
