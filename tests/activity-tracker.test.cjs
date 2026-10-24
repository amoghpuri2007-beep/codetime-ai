const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { installVSCodeMock, document } = require('./helpers/vscode.cjs');
const mock = installVSCodeMock();
after(mock.restore);
const { ActivityTracker } = require('../out/core/ActivityTracker.js');

test('startup detects an editor already open and listens to reading/navigation activity', () => {
  const tracker = new ActivityTracker();
  let activityCount = 0;
  tracker.onActivity(() => { activityCount += 1; });
  try {
    tracker.start();
    assert.equal(activityCount, 1, 'a focused editor should start tracking without a fresh keystroke');
    mock.events.selection.fire({ textEditor: mock.vscode.window.activeTextEditor });
    mock.events.visibleRanges.fire({ textEditor: mock.vscode.window.activeTextEditor });
    assert.equal(activityCount, 3, 'selection and scroll should keep reading time active');
    const active = mock.vscode.window.activeTextEditor.document;
    mock.events.changeDocument.fire({ document: active, contentChanges: [{ text: 'x' }] });
    assert.equal(activityCount, 4);
  } finally {
    tracker.dispose();
  }
});

test('background document updates do not extend the active timer', () => {
  const tracker = new ActivityTracker();
  let activityCount = 0;
  tracker.onActivity(() => { activityCount += 1; });
  try {
    tracker.start();
    const baseline = activityCount;
    const background = document('/project/generated.ts');
    mock.events.changeDocument.fire({ document: background, contentChanges: [{ text: 'generated' }] });
    mock.events.saveDocument.fire(background);
    mock.events.selection.fire({ textEditor: { document: background } });
    mock.events.visibleRanges.fire({ textEditor: { document: background } });
    assert.equal(activityCount, baseline);
  } finally {
    tracker.dispose();
  }
});

test('losing window focus stops activity and prevents background events restarting it', () => {
  const tracker = new ActivityTracker();
  let inactivityCount = 0;
  let activityCount = 0;
  tracker.onActivity(() => { activityCount += 1; });
  tracker.onInactivity(() => { inactivityCount += 1; });
  try {
    tracker.start();
    const baseline = activityCount;
    mock.vscode.window.state = { focused: false };
    mock.events.windowState.fire(mock.vscode.window.state);
    assert.equal(inactivityCount, 1);
    assert.equal(tracker.getState().isActive, false);
    mock.events.changeDocument.fire({ document: mock.vscode.window.activeTextEditor.document, contentChanges: [{ text: 'x' }] });
    assert.equal(activityCount, baseline);
    mock.vscode.window.state = { focused: true };
    mock.events.windowState.fire(mock.vscode.window.state);
    assert.equal(tracker.getState().isActive, true);
    assert.equal(activityCount, baseline + 1);
  } finally {
    mock.vscode.window.state = { focused: true };
    tracker.dispose();
  }
});

test('configured inactivity timeout controls when the timer pauses', () => {
  mock.settings.inactivityTimeout = 10;
  const tracker = new ActivityTracker(0);
  try {
    tracker.handleActivity(1_000);
    assert.equal(tracker.runInactivityCheck(10_999), false);
    assert.equal(tracker.runInactivityCheck(11_000), true);
    assert.equal(tracker.runInactivityCheck(12_000), false);
  } finally {
    delete mock.settings.inactivityTimeout;
    tracker.dispose();
  }
});
