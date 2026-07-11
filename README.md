# CodeTime AI

A VS Code extension for tracking coding time, focus sessions, and AI-powered insights.

## Features

- **Activity tracking** — Monitor coding sessions and editor activity
- **Focus detection** — Identify focused vs. distracted periods
- **Project & language stats** — Break down time by project and language
- **Git integration** — Track branch and commit activity
- **AI insights** — Claude-powered coding insights (coming soon)
- **Dashboard** — Visual overview of your coding patterns

## Development

```bash
npm install
npm run compile
```

Press F5 in VS Code to launch the Extension Development Host.

## Project Structure

```
src/
├── core/          # Session, activity, and focus management
├── trackers/      # Project, language, and git trackers
├── ai/            # Claude insight engine and prompts
├── dashboard/     # Webview dashboard and charts
├── storage/       # Local JSON persistence
└── utils/         # Time and formatting helpers
```

## License

MIT
