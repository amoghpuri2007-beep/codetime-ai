import * as vscode from 'vscode';
import { InsightEngine } from '../ai/InsightEngine';
import { StorageManager } from '../storage/StorageManager';
import { SessionRecord } from '../storage/schema';
import { buildDashboardPayload } from './dashboardData';
import { TrackingStatus, formatTrackingStatus } from '../core/trackingStatus';

/** Webview message sent from the extension host to the dashboard. */
interface DashboardUpdateMessage {
  type: 'update';
  data: ReturnType<typeof buildDashboardPayload>;
  trackingStatus: TrackingStatus;
  trackingStatusLabel: string;
}

/** Webview message sent from the dashboard to the extension host. */
interface DashboardRequestMessage {
  type: 'generateInsight' | 'refresh' | 'pauseTracking' | 'resumeTracking';
}

/**
 * CodeTime AI dashboard rendered inside a VS Code webview panel.
 */
export class DashboardPanel {
  private static currentPanel: DashboardPanel | undefined;

  /**
   * Creates a dashboard panel instance.
   *
   * @param panel - VS Code webview panel.
   * @param storageManager - Storage manager used to build dashboard data.
   * @param insightEngine - Insight engine used for AI cards and generation.
   */
  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly storageManager: StorageManager,
    private readonly insightEngine: InsightEngine,
    private readonly getLiveSession: () => SessionRecord | null,
    private readonly getTrackingStatus: () => TrackingStatus = () => ({ state: 'no-editor', language: null }),
  ) {
    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.webview.onDidReceiveMessage(async (message: DashboardRequestMessage) => {
      if (message.type === 'refresh') {
        this.sendData();
        return;
      }

      if (message.type === 'pauseTracking' || message.type === 'resumeTracking') {
        await vscode.commands.executeCommand(`codetime-ai.${message.type}`);
        this.sendData();
        return;
      }

      if (message.type === 'generateInsight') {
        await this.handleGenerateInsight();
      }
    });

    this.panel.onDidChangeViewState(() => {
      if (this.panel.visible) {
        this.sendData();
      }
    });

    this.panel.onDidDispose(() => {
      DashboardPanel.currentPanel = undefined;
    });

    this.sendData();
  }

  /**
   * Opens or reveals the dashboard panel.
   *
   * @param extensionUri - Extension root URI.
   * @param storageManager - Storage manager used to build dashboard data.
   * @param insightEngine - Insight engine used for AI cards and generation.
   * @returns Active dashboard panel instance.
   */
  static show(
    extensionUri: vscode.Uri,
    storageManager: StorageManager,
    insightEngine: InsightEngine,
    getLiveSession: () => SessionRecord | null = () => null,
    getTrackingStatus: () => TrackingStatus = () => ({ state: 'no-editor', language: null }),
  ): DashboardPanel {
    if (DashboardPanel.currentPanel) {
      DashboardPanel.currentPanel.panel.reveal(vscode.ViewColumn.One);
      DashboardPanel.currentPanel.sendData();
      return DashboardPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'codetimeAiDashboard',
      'CodeTime AI Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [extensionUri],
      },
    );

    DashboardPanel.currentPanel = new DashboardPanel(
      panel, storageManager, insightEngine, getLiveSession, getTrackingStatus,
    );
    return DashboardPanel.currentPanel;
  }

  /**
   * Refreshes the open dashboard panel when present.
   */
  static refreshIfOpen(): void {
    DashboardPanel.currentPanel?.sendData();
  }

  /**
   * Disposes the dashboard panel if it is currently open.
   */
  dispose(): void {
    DashboardPanel.currentPanel?.panel.dispose();
    DashboardPanel.currentPanel = undefined;
  }

  /**
   * Sends the latest dashboard payload to the webview.
   */
  sendData(): void {
    const payload = buildDashboardPayload(
      this.storageManager,
      this.insightEngine.getLatestInsight(),
      this.getLiveSession(),
    );

    const trackingStatus = this.getTrackingStatus();
    const message: DashboardUpdateMessage = {
      type: 'update',
      data: payload,
      trackingStatus,
      trackingStatusLabel: formatTrackingStatus(trackingStatus),
    };

    void this.panel.webview.postMessage(message);
  }

  /**
   * Generates a weekly insight and refreshes the dashboard.
   */
  private async handleGenerateInsight(): Promise<void> {
    try {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'CodeTime AI',
          cancellable: false,
        },
        async (progress) => {
          progress.report({ message: 'Generating weekly insight with Claude...' });
          await this.insightEngine.generateWeeklyInsight();
        },
      );

      void vscode.window.showInformationMessage('Weekly insight generated successfully.');
      this.sendData();
    } catch (error) {
      void vscode.window.showErrorMessage(this.insightEngine.getFriendlyErrorMessage(error));
    }
  }

  /**
   * Builds the dashboard HTML/CSS/JS rendered inside the webview.
   *
   * @param webview - VS Code webview used for CSP and resource URI conversion.
   * @returns Complete dashboard markup as a single HTML string.
   */
  private getWebviewContent(webview: vscode.Webview): string {
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src 'unsafe-inline'; script-src 'unsafe-inline' https://cdn.jsdelivr.net ${cspSource};" />
  <title>CodeTime AI Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg-primary: var(--vscode-editor-background);
      --bg-secondary: var(--vscode-sideBar-background);
      --bg-card: color-mix(in srgb, var(--vscode-editor-background) 88%, var(--vscode-foreground) 12%);
      --text-primary: var(--vscode-foreground);
      --text-muted: var(--vscode-descriptionForeground);
      --accent: var(--vscode-textLink-foreground);
      --accent-soft: color-mix(in srgb, var(--vscode-textLink-foreground) 18%, transparent);
      --border: var(--vscode-panel-border, rgba(255, 255, 255, 0.08));
      --success: var(--vscode-testing-iconPassed, #73c991);
      --warning: var(--vscode-editorWarning-foreground, #cca700);
      --stat-font: var(--vscode-editor-font-family, 'SF Mono', Menlo, Monaco, 'Courier New', monospace);
      --card-shadow: 0 10px 30px rgba(0, 0, 0, 0.22);
      --transition: 180ms ease;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      padding: 24px;
      font-family: var(--vscode-font-family);
      color: var(--text-primary);
      background:
        radial-gradient(circle at top right, color-mix(in srgb, var(--accent) 12%, transparent), transparent 35%),
        var(--bg-primary);
      min-height: 100vh;
    }

    .dashboard {
      max-width: 1400px;
      margin: 0 auto;
      display: grid;
      gap: 20px;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      flex-wrap: wrap;
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }

    .header-title h1 {
      margin: 0;
      font-size: 1.6rem;
      font-weight: 600;
    }

    .streak-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 14px;
      border-radius: 999px;
      background: var(--accent-soft);
      border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
      font-family: var(--stat-font);
      font-size: 0.95rem;
    }

    .tracking-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }

    .tracking-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .tracking-badge::before {
      content: '';
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentColor;
      flex: 0 0 auto;
    }

    .tracking-badge[data-state='tracking'] {
      color: var(--success);
    }

    .tracking-badge[data-state='manual'] {
      color: var(--warning);
    }

    .tracking-controls .button:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, var(--accent));
      outline-offset: 3px;
    }

    .tracking-help {
      margin: -8px 0 24px;
      color: var(--text-muted);
      font-size: 0.85rem;
    }

    .grid-two-col {
      display: grid;
      grid-template-columns: 1.05fr 1fr;
      gap: 20px;
    }

    .left-col, .right-col, .bottom-section {
      display: grid;
      gap: 20px;
      align-content: start;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 18px;
      box-shadow: var(--card-shadow);
      transition: transform var(--transition), border-color var(--transition), box-shadow var(--transition);
    }

    .card:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
      box-shadow: 0 14px 34px rgba(0, 0, 0, 0.28);
    }

    .card-title {
      margin: 0 0 14px;
      font-size: 0.95rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .stats-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
    }

    .stat-card {
      padding: 16px;
    }

    .stat-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-bottom: 8px;
    }

    .stat-value {
      font-family: var(--stat-font);
      font-size: 1.35rem;
      font-weight: 600;
    }

    .peak-value {
      font-family: var(--stat-font);
      font-size: 1.5rem;
      font-weight: 600;
      color: var(--accent);
    }

    .insight-summary {
      line-height: 1.6;
      margin-bottom: 12px;
    }

    .insight-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 12px;
    }

    .pill {
      padding: 6px 10px;
      border-radius: 999px;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      font-size: 0.82rem;
      font-family: var(--stat-font);
    }

    .insight-empty {
      color: var(--text-muted);
      line-height: 1.6;
    }

    .button {
      appearance: none;
      border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
      background: var(--accent-soft);
      color: var(--text-primary);
      border-radius: 10px;
      padding: 10px 14px;
      cursor: pointer;
      font: inherit;
      transition: background var(--transition), transform var(--transition);
    }

    .button:hover {
      background: color-mix(in srgb, var(--accent) 24%, transparent);
      transform: translateY(-1px);
    }

    .chart-card {
      min-height: 280px;
    }

    .chart-wrap {
      position: relative;
      height: 220px;
    }

    .projects-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 10px;
    }

    .project-item {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: 10px;
      background: color-mix(in srgb, var(--bg-secondary) 70%, transparent);
      border: 1px solid var(--border);
    }

    .project-name {
      font-weight: 500;
    }

    .project-time {
      font-family: var(--stat-font);
      color: var(--accent);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.92rem;
    }

    th, td {
      padding: 12px 10px;
      border-bottom: 1px solid var(--border);
      text-align: left;
    }

    th {
      color: var(--text-muted);
      font-size: 0.78rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    td.duration, td.focus {
      font-family: var(--stat-font);
    }

    .focus-yes {
      color: var(--success);
    }

    .focus-no {
      color: var(--text-muted);
    }

    .table-wrap {
      overflow-x: auto;
    }

    @media (max-width: 1100px) {
      .grid-two-col {
        grid-template-columns: 1fr;
      }

      .stats-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .insight-ring-wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 16px;
    }

    .insight-ring {
      width: 110px;
      height: 110px;
      filter: drop-shadow(0 0 10px rgba(255,255,255,0.1));
    }

    .insight-score-label {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 6px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .insight-section {
      margin-bottom: 12px;
    }

    .insight-section-title {
      font-size: 0.78rem;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }

    .insight-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 6px;
    }

    .insight-list li {
      font-size: 0.9rem;
      line-height: 1.5;
    }

    .insight-date {
      font-size: 0.78rem;
      color: var(--text-muted);
      margin-top: 8px;
    }
    @media (max-width: 640px) {
      body { padding: 16px; }
      .stats-row { grid-template-columns: 1fr; }
    }
    
    .goal-progress-wrap {
      display: grid;
      gap: 8px;
    }

    .goal-bar-track {
      height: 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.08);
      overflow: hidden;
    }

    .goal-bar-fill {
      height: 100%;
      border-radius: 999px;
      background: var(--accent);
      transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
    }

    .goal-label {
      font-family: var(--stat-font);
      font-size: 0.85rem;
      color: var(--text-muted);
    }


  </style>
</head>
<body>
  <div class="dashboard">
    <header class="header">
      <div class="header-title">
        <h1>CodeTime AI</h1>
        <div class="streak-badge" id="streakBadge">🔥 0 day streak</div>
      </div>
      <div class="tracking-controls">
        <span class="tracking-badge" id="trackingStatus" role="status" aria-live="polite" data-state="no-editor">Paused · No editor</span>
        <button class="button" id="toggleTrackingBtn" type="button" aria-label="Pause tracking">Pause</button>
      </div>
    </header>

    <p class="tracking-help">Totals include all folders. Time updates every second while tracking a code editor.</p>

    <div class="grid-two-col">
      <section class="left-col">
        <div class="stats-row">
          <div class="card stat-card">
            <div class="stat-label">Today</div>
            <div class="stat-value" id="statToday">0m</div>
          </div>
          <div class="card stat-card">
            <div class="stat-label">This Week</div>
            <div class="stat-value" id="statWeek">0m</div>
          </div>
          <div class="card stat-card">
            <div class="stat-label">Total</div>
            <div class="stat-value" id="statTotal">0m</div>
          </div>
          <div class="card stat-card">
            <div class="stat-label">Focus Sessions</div>
            <div class="stat-value" id="statFocus">0</div>
          </div>
        </div>

        <div class="card">
          <h2 class="card-title">Peak Hour</h2>
          <div class="peak-value" id="peakHour">No activity</div>
        </div>

        <div class="card">
          <h2 class="card-title">Daily Goal</h2>
          <div class="goal-progress-wrap">
            <div class="goal-bar-track">
              <div class="goal-bar-fill" id="goalBarFill" style="width:0%"></div>
            </div>
            <div class="goal-label" id="goalLabel">0m / 2h 0m</div>
          </div>
        </div>

        <div class="card">
          <h2 class="card-title">AI Insight</h2>
          <div id="insightContent">
            <p class="insight-empty">No insight generated yet. Create your first weekly AI summary.</p>
            <button class="button" id="generateInsightBtn">Generate Weekly Insight</button>
          </div>
        </div>
      </section>

      <section class="right-col">
        <div class="card chart-card">
          <h2 class="card-title">Language Usage</h2>
          <div class="chart-wrap"><canvas id="languageChart"></canvas></div>
        </div>

        <div class="card chart-card">
          <h2 class="card-title">Weekly Activity</h2>
          <div class="chart-wrap"><canvas id="weeklyChart"></canvas></div>
        </div>

        <div class="card chart-card">
          <h2 class="card-title">Daily Trend</h2>
          <div class="chart-wrap"><canvas id="trendChart"></canvas></div>
        </div>

        <div class="card">
          <h2 class="card-title">Top Projects</h2>
          <ul class="projects-list" id="projectsList"></ul>
        </div>
      </section>
    </div>

    <section class="bottom-section">
      <div class="card">
        <h2 class="card-title">Recent Sessions</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Project</th>
                <th>Language</th>
                <th>Duration</th>
                <th>Focus?</th>
              </tr>
            </thead>
            <tbody id="sessionsBody"></tbody>
          </table>
        </div>
      </div>
    </section>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let languageChart;
    let weeklyChart;
    let trendChart;
    let manuallyPaused = false;
    let lastInsightJson;
    let lastProjectsJson;
    let lastSessionsJson;
    let lastChartsJson;
    let lastChartsUpdate = 0;

    const chartColors = [
      '#4e9af1', '#73c991', '#cca700', '#f48771', '#b180d7', '#89d185', '#6796e6'
    ];

    function destroyCharts() {
      if (languageChart) languageChart.destroy();
      if (weeklyChart) weeklyChart.destroy();
      if (trendChart) trendChart.destroy();
    }

    function renderInsight(insight) {
  const container = document.getElementById('insightContent');
  if (!insight) {
    container.innerHTML = '<p class="insight-empty">No insights yet. Generate your first weekly report.</p><button class="button" id="generateInsightBtn">Generate Insight</button>';
    document.getElementById('generateInsightBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'generateInsight' });
    });
    return;
  }

  const score = insight.productivityScore ?? 0;
  const ringColor = score <= 40 ? '#f87171' : score <= 70 ? '#fbbf24' : '#34d399';
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (score / 100) * circumference;

  const patterns = (insight.patterns ?? []).map(function(p) {
    return '<li>\uD83D\uDCA1 ' + p + '</li>';
  }).join('');

  const suggestions = (insight.suggestions ?? []).map(function(s) {
    return '<li>\u2705 ' + s + '</li>';
  }).join('');

  const generatedDate = insight.generatedAt
    ? new Date(insight.generatedAt).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', year: 'numeric'
      })
    : '';

  container.innerHTML = \`
    <div class="insight-ring-wrap">
      <svg class="insight-ring" viewBox="0 0 80 80" xmlns="http://www.w3.org/2000/svg">
        <circle
          cx="40" cy="40" r="36"
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          stroke-width="7"
        />
        <circle
          class="ring-progress"
          cx="40" cy="40" r="36"
          fill="none"
          stroke="\${ringColor}"
          stroke-width="7"
          stroke-linecap="round"
          stroke-dasharray="\${circumference}"
          stroke-dashoffset="\${circumference}"
          data-offset="\${offset}"
          transform="rotate(-90 40 40)"
          style="transition: stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1);"
        />
        <text x="40" y="44" text-anchor="middle"
          fill="\${ringColor}"
          font-size="18"
          font-weight="700"
          font-family="monospace">
          \${score}
        </text>
      </svg>
      <div class="insight-score-label">Productivity Score</div>
    </div>

    <p class="insight-summary">\${insight.summary}</p>

    \${patterns ? \`
      <div class="insight-section">
        <div class="insight-section-title">Patterns</div>
        <ul class="insight-list">\${patterns}</ul>
      </div>
    \` : ''}

    \${suggestions ? \`
      <div class="insight-section">
        <div class="insight-section-title">Suggestions</div>
        <ul class="insight-list">\${suggestions}</ul>
      </div>
    \` : ''}

    \${generatedDate ? \`<div class="insight-date">Generated on \${generatedDate}</div>\` : ''}

    <button class="button" id="generateInsightBtn" style="margin-top:14px;">
      Regenerate
    </button>
  \`;

  // Animate the ring after render
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const ring = container.querySelector('.ring-progress');
      if (ring) {
        ring.style.strokeDashoffset = ring.getAttribute('data-offset');
      }
    });
  });

  document.getElementById('generateInsightBtn').addEventListener('click', () => {
    vscode.postMessage({ type: 'generateInsight' });
  });
}

    function renderProjects(projects) {
      const list = document.getElementById('projectsList');
      if (!projects.length) {
        list.innerHTML = '<li class="project-item"><span class="project-name">No projects tracked yet</span></li>';
        return;
      }

      list.innerHTML = projects.map((project) => \`
        <li class="project-item">
          <span class="project-name">\${project.name}</span>
          <span class="project-time">\${project.label}</span>
        </li>
      \`).join('');
    }

    function renderSessions(sessions) {
      const body = document.getElementById('sessionsBody');
      if (!sessions.length) {
        body.innerHTML = '<tr><td colspan="5">No sessions recorded yet.</td></tr>';
        return;
      }

      body.innerHTML = sessions.map((session) => \`
        <tr>
          <td>\${session.date}</td>
          <td>\${session.project}</td>
          <td>\${session.language}</td>
          <td class="duration">\${session.duration}</td>
          <td class="focus \${session.focus ? 'focus-yes' : 'focus-no'}">\${session.focus ? 'Yes' : 'No'}</td>
        </tr>
      \`).join('');
    }

    function renderCharts(data) {
      if (typeof Chart === 'undefined') return;
      destroyCharts();

      const languageCtx = document.getElementById('languageChart');
      const weeklyCtx = document.getElementById('weeklyChart');
      const trendCtx = document.getElementById('trendChart');

      const languageData = data.languages.length
        ? data.languages
        : [{ language: 'No data', seconds: 1, percentage: 100 }];

      languageChart = new Chart(languageCtx, {
        type: 'pie',
        data: {
          labels: languageData.map((item) => item.language),
          datasets: [{
            label: 'Seconds',
            data: languageData.map((item) => item.seconds),
            backgroundColor: chartColors,
            borderWidth: 0
          }]
        },
        options: {
          plugins: { legend: { position: 'bottom', labels: { color: '#cccccc' } } },
          maintainAspectRatio: false
        }
      });

      weeklyChart = new Chart(weeklyCtx, {
        type: 'bar',
        data: {
          labels: data.weeklyActivity.map((item) => item.day),
          datasets: [{
            label: 'Hours',
            data: data.weeklyActivity.map((item) => item.hours),
            backgroundColor: '#4e9af1',
            borderRadius: 8
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#aaaaaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#aaaaaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          },
          maintainAspectRatio: false
        }
      });

      trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
          labels: data.dailyTrend.map((item) => item.label),
          datasets: [{
            label: 'Hours',
            data: data.dailyTrend.map((item) => item.hours),
            borderColor: '#73c991',
            backgroundColor: 'rgba(115, 201, 145, 0.15)',
            fill: true,
            tension: 0.35,
            pointRadius: 3
          }]
        },
        options: {
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: '#aaaaaa' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            y: { ticks: { color: '#aaaaaa' }, grid: { color: 'rgba(255,255,255,0.05)' } }
          },
          maintainAspectRatio: false
        }
      });
    }

    function renderDashboard(data) {
      document.getElementById('streakBadge').textContent = \`🔥 \${data.streak.current} day streak\`;
      document.getElementById('statToday').textContent = data.stats.today;
      document.getElementById('statWeek').textContent = data.stats.week;
      document.getElementById('statTotal').textContent = data.stats.total;
      document.getElementById('statFocus').textContent = String(data.stats.focusSessions);
      document.getElementById('peakHour').textContent = data.peakHour;
      document.getElementById('goalBarFill').style.width = data.goal.percentage + '%';
      document.getElementById('goalLabel').textContent = data.goal.label;

      const insightJson = JSON.stringify(data.insight);
      if (insightJson !== lastInsightJson) {
        renderInsight(data.insight);
        lastInsightJson = insightJson;
      }
      const projectsJson = JSON.stringify(data.topProjects);
      if (projectsJson !== lastProjectsJson) {
        renderProjects(data.topProjects);
        lastProjectsJson = projectsJson;
      }
      const sessionsJson = JSON.stringify(data.recentSessions);
      if (sessionsJson !== lastSessionsJson) {
        renderSessions(data.recentSessions);
        lastSessionsJson = sessionsJson;
      }
      // Stopwatch labels update each second; keep chart animations at a slower pace.
      const chartsJson = JSON.stringify([data.languages, data.weeklyActivity, data.dailyTrend]);
      const now = Date.now();
      if (chartsJson !== lastChartsJson && (lastChartsJson === undefined || now - lastChartsUpdate >= 5000)) {
        renderCharts(data);
        lastChartsJson = chartsJson;
        lastChartsUpdate = now;
      }
    }

    function renderTrackingStatus(status, label) {
      const badge = document.getElementById('trackingStatus');
      if (badge.textContent !== label) badge.textContent = label;
      badge.dataset.state = status.state;
      manuallyPaused = status.state === 'manual';
      const button = document.getElementById('toggleTrackingBtn');
      button.textContent = manuallyPaused ? 'Resume' : 'Pause';
      button.setAttribute('aria-label', manuallyPaused ? 'Resume tracking' : 'Pause tracking');
    }

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'update') {
        renderTrackingStatus(message.trackingStatus, message.trackingStatusLabel);
        renderDashboard(message.data);
      }
    });

    document.getElementById('generateInsightBtn').addEventListener('click', () => {
      vscode.postMessage({ type: 'generateInsight' });
    });

    document.getElementById('toggleTrackingBtn').addEventListener('click', () => {
      vscode.postMessage({ type: manuallyPaused ? 'resumeTracking' : 'pauseTracking' });
    });

    vscode.postMessage({ type: 'refresh' });
  </script>
</body>
</html>`;
  }
}
