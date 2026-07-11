# CodeTime AI

A VS Code extension that tracks your coding time, detects focus sessions, and generates AI-powered weekly insights using Claude.

Built with TypeScript and the VS Code Extension API.

---

## Features

- **Automatic time tracking** — detects when you're actively coding and pauses after 60 seconds of inactivity
- **Focus session detection** — flags sessions where you coded for 25+ minutes without major breaks
- **Per-project and per-language breakdown** — see exactly where your time goes
- **Git branch tracking** — every session logs which branch you were on
- **AI-powered weekly insights** — sends your stats to Claude and gets back a productivity score, patterns, and suggestions
- **Streak system** — tracks daily coding streaks with milestone notifications
- **Interactive dashboard** — live charts built with Chart.js showing language usage, weekly activity, and 30-day trends
- **Export** — download your stats as CSV or JSON

---

## Dashboard

![Dashboard](screenshots/dashboard.png)

---

## Tech Stack

- TypeScript
- VS Code Extension API
- Chart.js (dashboard visualizations)
- Anthropic Claude API (AI insights)
- Node.js + local JSON storage

---

## Project Structure
src/
├── core/        # Activity tracking, session management, focus detection
├── trackers/    # Project, language, and git trackers
├── ai/          # Claude API integration and prompt building
├── dashboard/   # Webview dashboard and chart rendering
├── storage/     # Local JSON persistence
└── utils/       # Time formatting, notifications, export
## Getting Started

**Install from VSIX:**
1. Download `codetime-ai-1.0.0.vsix`
2. In VS Code: `Cmd+Shift+P` → `Extensions: Install from VSIX`
3. Reload VS Code

**For AI insights:**
1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. In VS Code settings, search `codetime` and add your key
3. Run `CodeTime: Generate Weekly Insight` from the command palette

**Build from source:**
```bash
npm install
npm run compile
```
Press `F5` in VS Code to launch the Extension Development Host.

---

## Commands

| Command | Description |
|---|---|
| `CodeTime: Open Dashboard` | Opens the stats dashboard |
| `CodeTime: Generate Weekly Insight` | Generates AI insight using Claude |
| `CodeTime: Export to JSON` | Exports all data as JSON |
| `CodeTime: Export to CSV` | Exports all data as CSV |
| `CodeTime: Open Settings` | Opens extension settings |

---

## Author

Amogh Puri — CSAI @ IIIT Delhi
