# Changelog

## [1.1.1] - 2026-10-24

### Fixed
- Show stopwatch seconds after minute and hour boundaries and refresh time totals every second.
- Refresh saved totals across VS Code windows instead of retaining stale per-window data.
- Replace storage files atomically so readers do not see partially written JSON.
- Keep unchanged dashboard content stable and refresh charts at a slower pace than the stopwatch.
- Explain that totals combine all folders and that updates require reloading each open window.

## [1.1.0] - 2026-10-17

### Added
- Live tracking status in the status bar and dashboard, with the active language or pause reason.
- Pause/resume controls in the status bar, dashboard, and Command Palette.
- Manual pause persists across workspace reloads until explicitly resumed.

## [1.0.1] - 2026-10-17

### Fixed
- Count editing and reading time until the configured inactivity timeout.
- Refresh dashboard and status bar totals every five seconds, including the current session.
- Display seconds for short sessions and retain small values in charts.
- Update daily goal progress from actual time and the configured target.
- Honor focus duration settings and ignore background document edits.

## [1.0.0] - 2025-07-02

### Added
- Automatic coding time tracking with smart inactivity detection
- Focus session detection (25+ minutes of uninterrupted coding)
- Per-project and per-language time breakdowns
- Git branch tracking per session
- AI-powered weekly insights via Anthropic Claude API
- Productivity score with animated circular progress ring
- Streak system with milestone notifications
- Interactive dashboard with live Chart.js visualizations
  - Language usage pie chart
  - Weekly activity bar chart
  - 30-day daily trend line chart
  - Top projects list
  - Recent sessions table
- CSV and JSON data export
- Status bar showing today's coding time
- Fully configurable via VS Code settings
