import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { RootStorage } from '../storage/schema';
import { StorageManager } from '../storage/StorageManager';
import { formatDurationShort } from './timeUtils';

/**
 * Handles CSV and JSON export of CodeTime AI statistics.
 */
export class ExportManager {
  constructor(private readonly storageManager: StorageManager) {}

  /**
   * Exports all stats to a JSON file chosen by the user.
   */
  async exportToJson(): Promise<void> {
    const data = this.storageManager.read();
    const defaultName = `codetime-export-${this.getTodayKey()}.json`;

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(this.getHomeDir(), defaultName)),
      filters: { 'JSON Files': ['json'] },
    });

    if (!uri) {
      return;
    }

    try {
      const json = JSON.stringify(data, null, 2);
      fs.writeFileSync(uri.fsPath, json, 'utf8');
      void vscode.window.showInformationMessage(
        `CodeTime AI: Exported to ${path.basename(uri.fsPath)}`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        `CodeTime AI: Export failed — ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Exports all stats to a CSV file chosen by the user.
   */
  async exportToCsv(): Promise<void> {
    const data = this.storageManager.read();
    const defaultName = `codetime-export-${this.getTodayKey()}.csv`;

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(path.join(this.getHomeDir(), defaultName)),
      filters: { 'CSV Files': ['csv'] },
    });

    if (!uri) {
      return;
    }

    try {
      const csv = this.buildCsv(data);
      fs.writeFileSync(uri.fsPath, csv, 'utf8');
      void vscode.window.showInformationMessage(
        `CodeTime AI: Exported to ${path.basename(uri.fsPath)}`,
      );
    } catch (error) {
      void vscode.window.showErrorMessage(
        `CodeTime AI: Export failed — ${this.getErrorMessage(error)}`,
      );
    }
  }

  /**
   * Builds a multi-section CSV string from storage data.
   */
  private buildCsv(data: RootStorage): string {
    const sections: string[] = [];

    // Section 1 — Daily Summary
    sections.push('=== DAILY SUMMARY ===');
    sections.push('Date,Total Hours,Focus Sessions,Top Language');
    const dailyRows = Object.values(data.daily)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((day) => {
        const topLang = day.sessions.reduce(
          (acc: Record<string, number>, s) => {
            acc[s.language] = (acc[s.language] ?? 0) + s.durationSeconds;
            return acc;
          },
          {},
        );
        const topLanguage = Object.entries(topLang).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';
        const hours = (day.totalSeconds / 3600).toFixed(2);
        return `${day.date},${hours},${day.focusSessions},${topLanguage}`;
      });
    sections.push(...dailyRows);

    // Section 2 — Project Breakdown
    sections.push('');
    sections.push('=== PROJECT BREAKDOWN ===');
    sections.push('Project,Total Hours,Last Opened,Top Language');
    const projectRows = Object.values(data.projects)
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .map((project) => {
        const topLang =
          Object.entries(project.languages).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'N/A';
        const hours = (project.totalSeconds / 3600).toFixed(2);
        const lastOpened = project.lastOpened.split('T')[0] ?? project.lastOpened;
        return `"${project.projectName}",${hours},${lastOpened},${topLang}`;
      });
    sections.push(...projectRows);

    // Section 3 — Language Breakdown
    sections.push('');
    sections.push('=== LANGUAGE BREAKDOWN ===');
    sections.push('Language,Total Hours,Percentage');
    const languageRows = Object.values(data.languages)
      .sort((a, b) => b.totalSeconds - a.totalSeconds)
      .map((lang) => {
        const hours = (lang.totalSeconds / 3600).toFixed(2);
        return `${lang.language},${hours},${lang.percentage.toFixed(1)}%`;
      });
    sections.push(...languageRows);

    // Section 4 — All Sessions
    sections.push('');
    sections.push('=== ALL SESSIONS ===');
    sections.push('Date,Start,End,Duration,Project,Language,Branch,Focus Session');
    const allSessions = Object.values(data.daily)
      .flatMap((day) => day.sessions)
      .sort((a, b) => b.startTime.localeCompare(a.startTime));

    const sessionRows = allSessions.map((s) => {
      const date = s.startTime.split('T')[0] ?? s.startTime;
      const start = new Date(s.startTime).toLocaleTimeString();
      const end = new Date(s.endTime).toLocaleTimeString();
      const duration = formatDurationShort(s.durationSeconds);
      const branch = (s as { branch?: string }).branch ?? 'no-git';
      return `${date},${start},${end},${duration},"${s.projectName}",${s.language},${branch},${s.isFocusSession ? 'Yes' : 'No'}`;
    });
    sections.push(...sessionRows);

    // Streak summary at the bottom
    sections.push('');
    sections.push('=== STREAK ===');
    sections.push('Current Streak,Longest Streak,Last Active');
    sections.push(
      `${data.streak.currentStreak},${data.streak.longestStreak},${data.streak.lastActiveDate}`,
    );

    return sections.join('\n');
  }

  private getTodayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private getHomeDir(): string {
    return process.env['HOME'] ?? process.env['USERPROFILE'] ?? '/';
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}