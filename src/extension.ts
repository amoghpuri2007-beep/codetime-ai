import * as vscode from 'vscode';
import { ActivityTracker } from './core/ActivityTracker';
import { FocusDetector } from './core/FocusDetector';
import { SessionManager } from './core/SessionManager';
import { InsightEngine, MissingApiKeyError } from './ai/InsightEngine';
import { DashboardPanel } from './dashboard/DashboardPanel';
import { StorageManager } from './storage/StorageManager';
import { GitTracker } from './trackers/GitTracker';
import { LanguageTracker } from './trackers/LanguageTracker';
import { ProjectTracker } from './trackers/ProjectTracker';
import { formatDurationShort } from './utils/timeUtils';
import { ExportManager } from './utils/ExportManager';

const STATUS_BAR_UPDATE_INTERVAL_MS = 30_000;

let sessionManager: SessionManager | undefined;
let activityTracker: ActivityTracker | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;
let statusBarUpdateTimer: ReturnType<typeof setInterval> | undefined;

/**
 * Updates the status bar label with today's total coding time.
 *
 * @param storageManager - Storage manager used to read today's stats.
 */
function updateStatusBar(storageManager: StorageManager): void {
  if (!statusBarItem) {
    return;
  }

  const todaySeconds = storageManager.getTodayStats().totalSeconds;
  statusBarItem.text = `$(clock) ${formatDurationShort(todaySeconds)} today`;
  statusBarItem.tooltip = 'CodeTime AI — click to open dashboard';
}

export function activate(context: vscode.ExtensionContext): void {
  const storageManager = new StorageManager(context.globalStorageUri);
  const focusDetector = new FocusDetector(storageManager);
  const projectTracker = new ProjectTracker(storageManager);
  const languageTracker = new LanguageTracker(storageManager);
  const gitTracker = new GitTracker();
  const insightEngine = new InsightEngine(storageManager);

  activityTracker = new ActivityTracker();
  sessionManager = new SessionManager(
    activityTracker,
    focusDetector,
    projectTracker,
    languageTracker,
    gitTracker,
  );

  activityTracker.start();
  sessionManager.start();

  // Treat window losing focus as inactivity
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState((state) => {
      if (!state.focused) {
        sessionManager?.handleInactivity(Date.now());
      }
    }),
  );

  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'codetime-ai.openDashboard';
  statusBarItem.show();
  updateStatusBar(storageManager);

  statusBarUpdateTimer = setInterval(() => {
    updateStatusBar(storageManager);
  }, STATUS_BAR_UPDATE_INTERVAL_MS);

  const openDashboard = (extensionUri: vscode.Uri) => {
    DashboardPanel.show(extensionUri, storageManager, insightEngine);
  };

  const openDashboardCommand = vscode.commands.registerCommand('codetime-ai.openDashboard', () => {
    openDashboard(context.extensionUri);
  });

  const showDashboardCommand = vscode.commands.registerCommand('codetime-ai.showDashboard', () => {
    openDashboard(context.extensionUri);
  });

  const generateWeeklyInsightCommand = vscode.commands.registerCommand(
    'codetime-ai.generateWeeklyInsight',
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'CodeTime AI',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Generating weekly insight with Claude...' });

          try {
            const insight = await insightEngine.generateWeeklyInsight();
            void vscode.window.showInformationMessage(
              `Weekly insight ready! Productivity score: ${insight.productivityScore}/100`,
            );
            DashboardPanel.refreshIfOpen();
          } catch (error) {
            if (error instanceof MissingApiKeyError) {
              return;
            }

            void vscode.window.showErrorMessage(insightEngine.getFriendlyErrorMessage(error));
          }
        },
      );
    },
  );

  const openSettingsCommand = vscode.commands.registerCommand(
    'codetime-ai.openSettings',
    () => {
      void vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'codetime',
      );
    },
  );
  const exportManager = new ExportManager(storageManager);

  const exportJsonCommand = vscode.commands.registerCommand(
    'codetime-ai.exportJson',
    async () => { await exportManager.exportToJson(); },
  );

  const exportCsvCommand = vscode.commands.registerCommand(
    'codetime-ai.exportCsv',
    async () => { await exportManager.exportToCsv(); },
  );

  context.subscriptions.push(
    openDashboardCommand,
    showDashboardCommand,
    generateWeeklyInsightCommand,
    openSettingsCommand,
    exportJsonCommand,
    exportCsvCommand,
    statusBarItem,
    {
      dispose: () => {
        if (statusBarUpdateTimer !== undefined) {
          clearInterval(statusBarUpdateTimer);
          statusBarUpdateTimer = undefined;
        }
      },
    },
    {
      dispose: () => {
        sessionManager?.flush();
        activityTracker?.dispose();
        sessionManager = undefined;
        activityTracker = undefined;
        statusBarItem = undefined;
      },
    },
  );
}

export function deactivate(): void {
  if (statusBarUpdateTimer !== undefined) {
    clearInterval(statusBarUpdateTimer);
    statusBarUpdateTimer = undefined;
  }

  sessionManager?.flush();
  activityTracker?.dispose();
  sessionManager = undefined;
  activityTracker = undefined;
  statusBarItem?.dispose();
  statusBarItem = undefined;
}
