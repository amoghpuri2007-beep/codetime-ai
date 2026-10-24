const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after } = require('node:test');
const { installVSCodeMock } = require('./helpers/vscode.cjs');
const mock = installVSCodeMock();
after(mock.restore);
const { StorageManager } = require('../out/storage/StorageManager.js');
const { buildDashboardPayload } = require('../out/dashboard/dashboardData.js');
const { formatDurationShort } = require('../out/utils/timeUtils.js');
const { SessionManager } = require('../out/core/SessionManager.js');
const { FocusDetector } = require('../out/core/FocusDetector.js');
const { ProjectTracker } = require('../out/trackers/ProjectTracker.js');
const { LanguageTracker } = require('../out/trackers/LanguageTracker.js');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codetime-regression-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const storage = new StorageManager({ fsPath: directory });
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const session = (id, durationSeconds, language = 'TypeScript') => ({
    id, durationSeconds, language,
    startTime: now.toISOString(),
    endTime: new Date(now.getTime() + durationSeconds * 1000).toISOString(),
    projectName: 'project', projectPath: '/project', branch: 'main', isFocusSession: false,
  });
  return { storage, session, directory, today: storage.getTodayDateKey() };
}

test('live activity appears in every dashboard aggregate before the session ends', (t) => {
  const { storage, session, today, directory } = fixture(t);
  const saved = session('saved', 20, 'JavaScript');
  const data = storage.getDefault();
  data.daily[today] = { ...storage.createEmptyDailyStats(today), totalSeconds: 20, sessions: [saved] };
  data.projects['/project'] = {
    projectName: 'project', projectPath: '/project', totalSeconds: 20,
    lastOpened: saved.endTime, sessions: [saved], languages: { JavaScript: 20 },
  };
  data.languages.JavaScript = { language: 'JavaScript', totalSeconds: 20, percentage: 100 };
  storage.write(data);
  const persistedBefore = JSON.stringify(storage.read());
  const fileBefore = fs.readFileSync(path.join(directory, 'codetime-storage.json'), 'utf8');
  const live = session('live', 30);
  const snapshot = storage.getSnapshot(live);

  assert.equal(snapshot.daily[today].totalSeconds, 50);
  assert.equal(snapshot.daily[today].sessions.length, 2);
  assert.equal(snapshot.projects['/project'].totalSeconds, 50);
  assert.deepEqual(snapshot.projects['/project'].languages, { JavaScript: 20, TypeScript: 30 });
  assert.equal(snapshot.languages.TypeScript.percentage, 60);
  assert.equal(snapshot.languages.JavaScript.percentage, 40);
  assert.equal(storage.getSnapshot(live).daily[today].totalSeconds, 50, 'refreshes must not accumulate the live snapshot twice');

  const payload = buildDashboardPayload(storage, null, live);
  assert.deepEqual(payload.stats, { today: '50s', week: '50s', total: '50s', focusSessions: 0 });
  assert.equal(payload.goal.todaySeconds, 50);
  assert.equal(payload.goal.targetSeconds, 7200);
  assert.ok(payload.goal.percentage > 0);
  assert.equal(payload.goal.label, '50s / 2h 00m 00s');
  assert.equal(payload.topProjects[0].seconds, 50);
  assert.equal(payload.recentSessions.length, 2);
  assert.equal(payload.languages[0].language, 'TypeScript');
  assert.equal(payload.weeklyActivity.reduce((sum, day) => sum + day.hours, 0), 50 / 3600);
  assert.equal(payload.dailyTrend.at(-1).hours, 50 / 3600);
  assert.equal(JSON.stringify(storage.read()), persistedBefore, 'rendering must not modify cached persisted data');
  assert.equal(fs.readFileSync(path.join(directory, 'codetime-storage.json'), 'utf8'), fileBefore);
});

test('a session already persisted is not added a second time by the live overlay', (t) => {
  const { storage, session, today } = fixture(t);
  const saved = session('same-session', 30);
  storage.updateDaily(saved);
  assert.equal(storage.getSnapshot(saved).daily[today].totalSeconds, 30);
  assert.equal(storage.getSnapshot(saved).daily[today].sessions.length, 1);
});

test('the configured daily goal uses live seconds and caps completed progress', (t) => {
  const { storage, session } = fixture(t);
  mock.settings.dailyGoalMinutes = 15;
  try {
    const payload = buildDashboardPayload(storage, null, session('live', 1200));
    assert.equal(payload.goal.todaySeconds, 1200);
    assert.equal(payload.goal.targetSeconds, 900);
    assert.equal(payload.goal.percentage, 100);
    assert.equal(payload.goal.label, '20m 00s / 15m 00s');
  } finally {
    delete mock.settings.dailyGoalMinutes;
  }
});

test('stopwatch labels retain seconds across minute and hour boundaries', () => {
  assert.equal(formatDurationShort(0), '0s');
  assert.equal(formatDurationShort(1), '1s');
  assert.equal(formatDurationShort(59), '59s');
  assert.equal(formatDurationShort(60), '1m 00s');
  assert.equal(formatDurationShort(68), '1m 08s');
  assert.equal(formatDurationShort(3599), '59m 59s');
  assert.equal(formatDurationShort(3600), '1h 00m 00s');
  assert.equal(formatDurationShort(3660), '1h 01m 00s');
  assert.equal(formatDurationShort(3723), '1h 02m 03s');
});

test('stopwatch labels floor fractional seconds and handle invalid durations safely', () => {
  assert.equal(formatDurationShort(0.9), '0s');
  assert.equal(formatDurationShort(59.9), '59s');
  assert.equal(formatDurationShort(68.9), '1m 08s');
  for (const invalid of [-1, -0.5, NaN, Infinity, -Infinity]) {
    assert.equal(formatDurationShort(invalid), '0s');
  }
});

test('a continuous session survives language changes and persists the same live total once', (t) => {
  const { storage, session, today } = fixture(t);
  const start = new Date(session('clock', 0).startTime).getTime();
  const originalLanguage = mock.vscode.window.activeTextEditor.document.languageId;
  const manager = new SessionManager(
    {},
    new FocusDetector(storage, async () => undefined),
    new ProjectTracker(storage),
    new LanguageTracker(storage),
    { getCurrentBranch: () => 'main' },
  );
  try {
    for (let elapsed = 0; elapsed < 1_800_000; elapsed += 30_000) {
      if (elapsed === 900_000) mock.vscode.window.activeTextEditor.document.languageId = 'javascript';
      manager.handleActivity(start + elapsed);
    }
    const live = manager.getCurrentSession(start + 1_800_000);
    assert.equal(live.durationSeconds, 1800);
    assert.equal(live.isFocusSession, false);
    assert.equal(manager.getCompletedSessions().length, 0);
    for (let refresh = 0; refresh < 3; refresh += 1) {
      assert.equal(buildDashboardPayload(storage, null, live).stats.today, '30m 00s');
      assert.equal(storage.getTodayStats().totalSeconds, 0);
    }

    manager.handleInactivity(start + 1_800_000);
    assert.equal(manager.getCurrentSession(start + 1_800_000), null);
    assert.equal(manager.getCompletedSessions().length, 1);
    assert.equal(storage.read().daily[today].totalSeconds, live.durationSeconds);
    assert.equal(storage.read().daily[today].sessions.length, 1);
    assert.equal(storage.read().daily[today].focusSessions, 1);
    assert.equal(storage.read().daily[today].sessions[0].isFocusSession, true);
    for (let refresh = 0; refresh < 3; refresh += 1) {
      assert.equal(buildDashboardPayload(storage, null, live).stats.today, '30m 00s');
      assert.equal(storage.getTodayStats().sessions.length, 1);
    }
  } finally {
    mock.vscode.window.activeTextEditor.document.languageId = originalLanguage;
    manager.stop();
  }
});

test('two editor windows refresh saved totals and preserve each other\'s completed sessions', (t) => {
  const { storage: windowA, session, directory, today } = fixture(t);
  const windowB = new StorageManager({ fsPath: directory });
  assert.equal(windowA.getTodayStats().totalSeconds, 0);
  assert.equal(windowB.getTodayStats().totalSeconds, 0);

  const first = { ...session('window-a', 60), projectName: 'frontend', projectPath: '/projects/frontend' };
  const second = { ...session('window-b', 30, 'Python'), projectName: 'analytics', projectPath: '/projects/analytics' };
  const persist = (storage, record) => {
    new ProjectTracker(storage).onSessionEnd(record);
    new LanguageTracker(storage).onSessionEnd(record);
    new FocusDetector(storage, async () => undefined).persistSession(record);
  };
  persist(windowA, first);
  assert.equal(windowB.getTodayStats().totalSeconds, 60, 'an already-open window must see another window\'s save');
  persist(windowB, second);
  assert.equal(windowA.getTodayStats().totalSeconds, 90);

  const fresh = new StorageManager({ fsPath: directory });
  const saved = fresh.read();
  assert.equal(saved.daily[today].totalSeconds, 90);
  assert.deepEqual(saved.daily[today].sessions.map((record) => record.id), ['window-a', 'window-b']);
  assert.equal(saved.projects['/projects/frontend'].totalSeconds, 60);
  assert.equal(saved.projects['/projects/analytics'].totalSeconds, 30);
  assert.equal(saved.languages.TypeScript.totalSeconds, 60);
  assert.equal(saved.languages.Python.totalSeconds, 30);

  const live = { ...second, id: 'window-b-live', durationSeconds: 10 };
  for (let refresh = 0; refresh < 3; refresh += 1) {
    assert.equal(windowA.getTodayStats().totalSeconds, 90);
    assert.equal(windowB.getTodayStats().totalSeconds, 90);
    assert.equal(windowB.getSnapshot(live).daily[today].totalSeconds, 100);
    assert.equal(windowB.getSnapshot(second).daily[today].totalSeconds, 90);
    assert.equal(fresh.getTodayStats().sessions.length, 2);
  }
  assert.deepEqual(fs.readdirSync(directory), ['codetime-storage.json'], 'atomic saves should leave no temporary files');
});
