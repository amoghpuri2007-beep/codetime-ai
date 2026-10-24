# CodeTime AI

A VS Code extension that tracks active coding time, shows where your time goes, and generates optional weekly insights with Claude.

**Current version: 1.1.1** · **VS Code 1.85 or newer** · **TypeScript**

## Features

- **Live stopwatch:** coding time updates every second, including seconds after minute and hour boundaries—for example, `1m 08s` and `1h 02m 03s`.
- **Tracking status:** see the current language or the reason tracking is paused in the status bar and dashboard.
- **Manual pause and resume:** control tracking from the status bar, dashboard, or Command Palette. Manual pause survives workspace reloads.
- **Coding dashboard:** view today's time, weekly and lifetime totals, daily goal progress, language usage, weekly activity, a 14-day trend, top projects, recent sessions, and peak coding hour.
- **Focus sessions and streaks:** count completed focus sessions and build a streak by reaching 30 minutes of coding in a day.
- **Project and language breakdowns:** combine activity across folders while keeping project-level statistics. Completed sessions include the Git branch when available.
- **Optional AI insights:** generate a weekly summary, patterns, suggestions, and a productivity score using your Anthropic API key.
- **JSON and CSV exports:** save recorded statistics and session history to a file you choose.

## Getting started

### Run from source

```bash
git clone https://github.com/amoghpuri2007-beep/codetime-ai.git
cd codetime-ai
npm install
npm run compile
```

Open the project in VS Code and press **F5** to launch the Extension Development Host. Open a code file in that window to start tracking.

Use **CodeTime: Open Dashboard** from the Command Palette, or click the tracking status in the status bar.

### Install a packaged extension

If you have a CodeTime AI `.vsix` file, open the Extensions view, choose **… → Install from VSIX…**, and select the file.

After installing an update, run **Developer: Reload Window** in **every open VS Code window**, or quit and reopen VS Code. Existing windows can keep running the previous extension version until they reload.

## How tracking works

Tracking begins when a supported text editor is active in a focused VS Code window. Editing, saving, moving the cursor, and scrolling keep the timer active.

The timer pauses when:

- No activity occurs for the configured inactivity timeout—60 seconds by default.
- The VS Code window loses focus.
- There is no active code editor, such as when the dashboard is selected.
- You pause tracking manually.

The status explains what is happening:

- `Tracking · TypeScript`
- `Paused · Idle`
- `Paused · Window inactive`
- `Paused · No editor`
- `Paused · Unsupported editor`
- `Paused · Manual`

Click the pause/play icon beside the status bar indicator, or use the dashboard's **Pause / Resume** button. A manual pause stays enabled for that workspace until you explicitly resume.

The timer measures code-editor activity. Time spent only viewing the dashboard, using AI chat, or working in a terminal is not automatically counted as coding activity.

### Across folders and windows

CodeTime is not limited to this repository. Once installed and enabled, it activates in other VS Code folders too.

**Today**, **This Week**, and **Total** combine recorded time across folders that share the same VS Code profile and storage. **Top Projects** provides the project breakdown.

The current session appears live in its own window. When it finishes, saved totals become available to other windows on their next refresh. Different VS Code profiles and remote environments may require their own extension installation and use separate storage.

### Focus sessions and streaks

A focus session is counted after it ends and reaches the configured minimum duration—25 minutes by default. A streak day requires at least 30 minutes of recorded coding time. Both counters can remain zero during shorter sessions.

## Settings

Open **CodeTime: Open Settings** from the Command Palette, or search for `codetime` in VS Code Settings.

- `codetime.inactivityTimeout`: seconds without editor activity before pausing. Default: `60`; range: `10–300`.
- `codetime.focusSessionMinutes`: minimum active minutes for a completed focus session. Default: `25`; range: `5–120`.
- `codetime.dailyGoalMinutes`: daily coding goal shown in the dashboard. Default: `120`; range: `15–720`.
- `codetime.anthropicApiKey`: your Anthropic API key for optional weekly insights. Empty by default.
- `codetime.enableMilestoneNotifications`: daily milestone notifications. Default: `true`.
- `codetime.enableFocusNotifications`: focus-session notifications. Default: `true`.

For example:

```json
{
  "codetime.inactivityTimeout": 60,
  "codetime.focusSessionMinutes": 25,
  "codetime.dailyGoalMinutes": 120
}
```

An API key is not required for time tracking, the dashboard, or exports. Weekly AI generation requires an Anthropic API key and an internet connection.

## Commands

Open the Command Palette with **Cmd+Shift+P** on macOS or **Ctrl+Shift+P** on Windows/Linux:

- **CodeTime: Open Dashboard** / **CodeTime AI: Show Dashboard**
- **CodeTime: Pause Tracking** / **CodeTime: Resume Tracking**
- **CodeTime: Generate Weekly Insight**
- **CodeTime: Open Settings**
- **CodeTime: Export to JSON**
- **CodeTime: Export to CSV**

## Data and privacy

Recorded activity is stored locally in `codetime-storage.json` in the extension's VS Code global storage directory. Session metadata includes timestamps, duration, project name and path, language, Git branch, and focus classification. Source code and individual keystroke contents are not stored in session records.

When you request a weekly AI insight, aggregated statistics—including project names, language usage, coding time, focus counts, and streak information—are sent to Anthropic. The dashboard loads Chart.js from a CDN to render charts.

## Development

```bash
npm run compile   # Compile TypeScript into out/
npm run watch     # Recompile as source files change
npm run lint      # Type-check without generating files
npm test          # Compile and run the regression suite
```

The regression suite covers activity detection, idle timeouts, manual pause/resume, workspace pause persistence, stopwatch updates, dashboard messages, live-session totals, focus classification, and saved data shared between editor windows.

```text
src/
├── core/          # Activity, session, focus, and tracking status logic
├── trackers/      # Project, language, and Git metadata
├── dashboard/     # Webview, charts, and dashboard data
├── storage/       # Local JSON persistence and streaks
├── ai/            # Weekly statistics, prompts, and insight generation
├── utils/         # Configuration, formatting, exports, and notifications
└── extension.ts   # Activation, commands, and status bar
tests/             # Node.js regression tests with a VS Code API mock
```

`out/`, `node_modules/`, and packaged `.vsix` files are generated locally and excluded from Git.

## Author

[Amogh Puri](https://github.com/amoghpuri2007-beep) — CSAI @ IIIT Delhi
