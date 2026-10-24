const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, after, beforeEach } = require('node:test');
const { installVSCodeMock, document } = require('./helpers/vscode.cjs');
const mock = installVSCodeMock();
after(mock.restore);
const { ActivityTracker } = require('../out/core/ActivityTracker.js');
const { SessionManager } = require('../out/core/SessionManager.js');
const { FocusDetector } = require('../out/core/FocusDetector.js');
const { StorageManager } = require('../out/storage/StorageManager.js');
const { ProjectTracker } = require('../out/trackers/ProjectTracker.js');
const { LanguageTracker } = require('../out/trackers/LanguageTracker.js');

beforeEach(() => {
  mock.vscode.window.state = { focused: true };
  mock.vscode.window.activeTextEditor = { document: document('/project/main.cpp', 'cpp') };
});

function tempStorage(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codetime-controls-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { storage: new StorageManager({ fsPath: directory }), directory };
}

test('tracking status reports mapped language and emits changes after activity events', (t) => {
  const tracker = new ActivityTracker();
  t.after(() => tracker.dispose());
  const order = [];
  tracker.onActivity(() => order.push('activity'));
  tracker.onInactivity(() => order.push('inactivity'));
  tracker.onDidChangeStatus(() => order.push(tracker.getStatus().state));
  tracker.start();
  assert.deepEqual(tracker.getStatus(), { state: 'tracking', language: 'C++' });
  assert.deepEqual(order, ['activity', 'tracking']);
  mock.events.selection.fire({ textEditor: mock.vscode.window.activeTextEditor });
  assert.deepEqual(order, ['activity', 'tracking', 'activity'], 'ordinary activity must not repeat status notifications');
  tracker.pause();
  assert.deepEqual(order.slice(-2), ['inactivity', 'manual']);
  tracker.pause();
  assert.equal(order.filter((event) => event === 'manual').length, 1);
});

test('manual pause survives editor and focus changes until an explicit resume', (t) => {
  const tracker = new ActivityTracker();
  t.after(() => tracker.dispose());
  let activities = 0;
  tracker.onActivity(() => { activities += 1; });
  tracker.start();
  tracker.pause();
  const pausedActivities = activities;
  mock.vscode.window.state = { focused: false };
  mock.events.windowState.fire(mock.vscode.window.state);
  mock.vscode.window.activeTextEditor = { document: document('/project/view.jsx', 'javascriptreact') };
  mock.events.activeEditor.fire(mock.vscode.window.activeTextEditor);
  mock.vscode.window.state = { focused: true };
  mock.events.windowState.fire(mock.vscode.window.state);
  mock.events.changeDocument.fire({ document: mock.vscode.window.activeTextEditor.document, contentChanges: [{ text: 'x' }] });
  mock.events.selection.fire({ textEditor: mock.vscode.window.activeTextEditor });
  mock.events.visibleRanges.fire({ textEditor: mock.vscode.window.activeTextEditor });
  assert.equal(tracker.getStatus().state, 'manual');
  assert.equal(tracker.getState().isActive, false);
  assert.equal(activities, pausedActivities);
  tracker.resume();
  assert.deepEqual(tracker.getStatus(), { state: 'tracking', language: 'JavaScript (React)' });
  assert.equal(activities, pausedActivities + 1);
});

test('restored manual pause never starts a session and resume respects editor eligibility', (t) => {
  const tracker = new ActivityTracker(Date.now(), true);
  t.after(() => tracker.dispose());
  let activities = 0;
  tracker.onActivity(() => { activities += 1; });
  tracker.start();
  assert.equal(tracker.getStatus().state, 'manual');
  assert.equal(activities, 0);
  mock.vscode.window.activeTextEditor = undefined;
  mock.events.activeEditor.fire(undefined);
  assert.equal(tracker.getStatus().state, 'manual');
  tracker.resume();
  assert.equal(tracker.getStatus().state, 'no-editor');
  assert.equal(tracker.getStatus().language, null);
  assert.equal(activities, 0);
  const output = document('/output', 'log');
  output.uri.scheme = 'output';
  mock.vscode.window.activeTextEditor = { document: output };
  mock.events.activeEditor.fire(mock.vscode.window.activeTextEditor);
  assert.equal(tracker.getStatus().state, 'unsupported-editor');
  assert.equal(activities, 0);
  mock.vscode.window.activeTextEditor = { document: document('/project/run.py', 'python') };
  mock.vscode.window.state = { focused: false };
  mock.events.windowState.fire(mock.vscode.window.state);
  tracker.pause();
  tracker.resume();
  assert.equal(tracker.getStatus().state, 'window-inactive');
  assert.equal(activities, 0);
  mock.vscode.window.state = { focused: true };
  mock.events.windowState.fire(mock.vscode.window.state);
  assert.deepEqual(tracker.getStatus(), { state: 'tracking', language: 'Python' });
  assert.equal(activities, 1);
});

test('idle status and language switches update without waiting for a refresh interval', (t) => {
  let now = Date.now();
  t.mock.method(Date, 'now', () => now);
  const tracker = new ActivityTracker(now);
  t.after(() => tracker.dispose());
  const states = [];
  tracker.onDidChangeStatus(() => states.push(tracker.getStatus()));
  tracker.start();
  now += 60_000;
  assert.equal(tracker.runInactivityCheck(now), true);
  assert.equal(tracker.getStatus().state, 'idle');
  const count = states.length;
  tracker.runInactivityCheck(now + 10_000);
  assert.equal(states.length, count);
  mock.vscode.window.activeTextEditor = { document: document('/project/view.jsx', 'javascriptreact') };
  mock.events.activeEditor.fire(mock.vscode.window.activeTextEditor);
  assert.deepEqual(tracker.getStatus(), { state: 'tracking', language: 'JavaScript (React)' });
  assert.equal(states.length, count + 1);
});

test('pausing persists elapsed time immediately and excludes the entire paused interval', (t) => {
  const { storage } = tempStorage(t);
  const currentDate = new Date();
  currentDate.setHours(12, 0, 0, 0);
  let now = currentDate.getTime();
  t.mock.method(Date, 'now', () => now);
  const tracker = new ActivityTracker(now);
  const manager = new SessionManager(
    tracker, new FocusDetector(storage, async () => undefined),
    new ProjectTracker(storage), new LanguageTracker(storage),
    { getCurrentBranch: () => 'main' },
  );
  t.after(() => { manager.flush(); tracker.dispose(); });
  manager.start();
  tracker.start();
  now += 20_000;
  assert.equal(manager.getCurrentSession().durationSeconds, 20);
  let savedAtPauseNotification;
  tracker.onDidChangeStatus(() => {
    if (tracker.getStatus().state === 'manual') savedAtPauseNotification = storage.getTodayStats().totalSeconds;
  });
  tracker.pause();
  assert.equal(savedAtPauseNotification, 20, 'status changes must observe completed persistence');
  assert.equal(manager.getCurrentSession(), null);
  assert.equal(storage.getTodayStats().sessions.length, 1);
  now += 600_000;
  tracker.runInactivityCheck(now);
  mock.events.saveDocument.fire(mock.vscode.window.activeTextEditor.document);
  assert.equal(manager.getCurrentSession(), null);
  assert.equal(storage.getTodayStats().totalSeconds, 20);
  tracker.resume();
  now += 15_000;
  tracker.pause();
  assert.equal(storage.getTodayStats().totalSeconds, 35);
  assert.deepEqual(storage.getTodayStats().sessions.map((session) => session.durationSeconds), [20, 15]);
});

test('extension commands and status controls preserve manual pause across reloads', async (t) => {
  const { directory } = tempStorage(t);
  const extension = require('../out/extension.js');
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  let now = date.getTime();
  t.mock.method(Date, 'now', () => now);
  const values = new Map([['trackingPaused', true]]);
  const writes = [];
  const workspaceState = {
    get: (key, fallback) => values.has(key) ? values.get(key) : fallback,
    update: async (key, value) => { values.set(key, value); writes.push({ key, value }); },
  };
  const context = {
    globalStorageUri: mock.vscode.Uri.file(directory),
    extensionUri: mock.vscode.Uri.file('/extension'),
    subscriptions: [], workspaceState,
  };
  function stop() {
    for (const panel of mock.panels) if (!panel.disposed) panel.dispose();
    extension.deactivate();
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
  }
  t.after(stop);
  extension.activate(context);
  for (const command of ['pauseTracking', 'resumeTracking', 'toggleTracking']) {
    assert.ok(mock.commands.has(`codetime-ai.${command}`));
  }
  const activeBars = () => mock.statusBars.filter((item) => !item.disposed);
  const mainStatus = () => activeBars().find((item) => item.command === 'codetime-ai.openDashboard');
  const control = () => activeBars().find((item) => item.command === 'codetime-ai.toggleTracking');
  assert.equal(activeBars().length, 2);
  assert.match(mainStatus().text, /paused/i);
  assert.match(String(control().tooltip), /resume/i);
  assert.ok(activeBars().every((item) => item.visible));

  await mock.vscode.commands.executeCommand(mainStatus().command);
  const dashboard = mock.panels.at(-1);
  assert.equal(dashboard.webview.messages.at(-1).trackingStatus.state, 'manual');
  await dashboard.receiveMessage({ type: 'resumeTracking' });
  assert.equal(values.get('trackingPaused'), false);
  assert.match(mainStatus().text, /tracking/i);
  assert.match(mainStatus().text, /C\+\+/);
  assert.match(String(control().tooltip), /pause/i);
  assert.equal(dashboard.webview.messages.at(-1).trackingStatus.state, 'tracking');
  now += 12_000;
  await dashboard.receiveMessage({ type: 'pauseTracking' });
  assert.equal(values.get('trackingPaused'), true);
  assert.match(mainStatus().text, /paused/i);
  assert.match(mainStatus().text, /12s today/);
  assert.equal(dashboard.webview.messages.at(-1).trackingStatus.state, 'manual');
  assert.equal(dashboard.webview.messages.at(-1).data.stats.today, '12s');
  now += 600_000;
  await mock.vscode.commands.executeCommand(control().command);
  assert.equal(values.get('trackingPaused'), false);
  now += 8_000;
  await mock.vscode.commands.executeCommand(control().command);
  assert.equal(values.get('trackingPaused'), true);
  assert.match(mainStatus().text, /20s today/);
  assert.deepEqual(writes.map((write) => write.value), [false, true, false, true]);
  assert.equal(mock.commandCalls.filter((call) => call.name === 'setContext' && call.args[0] === 'codetime-ai.trackingPaused').at(-1).args[1], true);

  stop();
  now += 600_000;
  extension.activate(context);
  assert.match(mainStatus().text, /paused/i);
  assert.match(mainStatus().text, /20s today/);
  mock.events.selection.fire({ textEditor: mock.vscode.window.activeTextEditor });
  mock.vscode.window.state = { focused: false };
  mock.events.windowState.fire(mock.vscode.window.state);
  mock.vscode.window.state = { focused: true };
  mock.events.windowState.fire(mock.vscode.window.state);
  assert.match(mainStatus().text, /paused/i);
  assert.match(mainStatus().text, /20s today/);
  const persisted = new StorageManager({ fsPath: directory });
  assert.equal(persisted.getTodayStats().totalSeconds, 20);
  assert.equal(persisted.getTodayStats().sessions.length, 2);
});

test('the status bar and dashboard stopwatch advance every second and freeze while paused', async (t) => {
  const { directory } = tempStorage(t);
  const previousFolders = mock.vscode.workspace.workspaceFolders;
  const previousResolver = mock.vscode.workspace.getWorkspaceFolder;
  const folder = { name: 'analytics', uri: mock.vscode.Uri.file('/client-work/analytics') };
  mock.vscode.workspace.workspaceFolders = [folder];
  mock.vscode.workspace.getWorkspaceFolder = () => folder;
  mock.vscode.window.activeTextEditor = { document: document('/client-work/analytics/report.py', 'python') };
  t.after(() => {
    mock.vscode.workspace.workspaceFolders = previousFolders;
    mock.vscode.workspace.getWorkspaceFolder = previousResolver;
  });
  const extension = require('../out/extension.js');
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  let now = date.getTime();
  const scheduled = new Map();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', (callback, delay, ...args) => {
    const timer = {};
    scheduled.set(timer, { callback: () => callback(...args), delay, nextAt: now + delay });
    return timer;
  });
  t.mock.method(globalThis, 'clearInterval', (timer) => scheduled.delete(timer));
  function tick() {
    now += 1000;
    for (const timer of scheduled.values()) {
      if (timer.nextAt <= now) {
        timer.nextAt += timer.delay;
        timer.callback();
      }
    }
  }
  const pausedState = new Map();
  const context = {
    globalStorageUri: mock.vscode.Uri.file(directory),
    extensionUri: mock.vscode.Uri.file('/extension'),
    subscriptions: [],
    workspaceState: {
      get: (key, fallback) => pausedState.get(key) ?? fallback,
      update: async (key, value) => pausedState.set(key, value),
    },
  };
  function stop() {
    for (const panel of mock.panels) if (!panel.disposed) panel.dispose();
    extension.deactivate();
    for (const disposable of context.subscriptions.splice(0)) disposable.dispose();
  }
  t.after(stop);
  extension.activate(context);
  const status = mock.statusBars.find((item) => !item.disposed && item.command === 'codetime-ai.openDashboard');
  await mock.vscode.commands.executeCommand(status.command);
  const dashboard = mock.panels.at(-1);
  assert.match(status.text, /Tracking · Python/);
  assert.match(status.text, /0s today$/);
  assert.equal(dashboard.webview.messages.at(-1).data.stats.today, '0s');

  for (let elapsed = 1; elapsed <= 68; elapsed += 1) {
    if (elapsed % 30 === 0) {
      mock.events.selection.fire({ textEditor: mock.vscode.window.activeTextEditor });
    }
    tick();
    const expected = elapsed < 60 ? `${elapsed}s` : `1m ${String(elapsed - 60).padStart(2, '0')}s`;
    assert.ok(status.text.endsWith(`${expected} today`), `status bar should show ${expected} after ${elapsed} seconds`);
    assert.equal(dashboard.webview.messages.at(-1).data.stats.today, expected);
    assert.equal(dashboard.webview.messages.at(-1).trackingStatus.state, 'tracking');
  }
  await dashboard.receiveMessage({ type: 'pauseTracking' });
  for (let elapsed = 0; elapsed < 10; elapsed += 1) {
    tick();
    assert.match(status.text, /1m 08s today$/);
    assert.equal(dashboard.webview.messages.at(-1).data.stats.today, '1m 08s');
    assert.equal(dashboard.webview.messages.at(-1).trackingStatus.state, 'manual');
  }
  await dashboard.receiveMessage({ type: 'resumeTracking' });
  tick();
  assert.match(status.text, /1m 09s today$/);
  tick();
  assert.match(status.text, /1m 10s today$/);
  assert.equal(dashboard.webview.messages.at(-1).data.stats.today, '1m 10s');
  stop();
  assert.equal(scheduled.size, 0, 'extension disposal must clear its timers');
  const saved = new StorageManager({ fsPath: directory }).read();
  assert.equal(saved.projects['/client-work/analytics'].totalSeconds, 70);
  assert.equal(saved.languages.Python.totalSeconds, 70);
});
