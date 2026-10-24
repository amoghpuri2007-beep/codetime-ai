const assert = require('node:assert/strict');
const { test, after } = require('node:test');
const { installVSCodeMock, EventEmitter } = require('./helpers/vscode.cjs');
const mock = installVSCodeMock();
after(mock.restore);

const {
  createPendingSession, recordActivityBurst, pauseSession, finalizeSessionRecord,
} = require('../out/core/sessionLogic.js');
const { SessionManager } = require('../out/core/SessionManager.js');
const { FocusDetector } = require('../out/core/FocusDetector.js');

const start = new Date('2026-10-17T10:00:00Z').getTime();
const pending = () => createPendingSession('test-session', start, 'TypeScript', 'project', '/project');

test('ordinary pauses between editor events count toward coding time', () => {
  const initial = pending();
  let session = recordActivityBurst(initial, start + 2_000);
  session = recordActivityBurst(session, start + 7_000);
  assert.equal(finalizeSessionRecord(session, start + 7_000, false, 'main').durationSeconds, 7);
  assert.equal(finalizeSessionRecord(session, start + 10_000, false, 'main').durationSeconds, 10);
  assert.deepEqual(session.inactivityGapsMs, []);
  assert.deepEqual(initial, pending(), 'taking activity updates must not mutate a previous snapshot');
});

test('closing an editor includes trailing time, capped at the inactivity timeout', () => {
  const session = recordActivityBurst(pending(), start + 5_000);
  const paused = pauseSession(session, start + 12_000);
  assert.equal(paused.currentSegmentStartMs, null);
  assert.equal(finalizeSessionRecord(paused, start + 20_000, false, 'main').durationSeconds, 12);
  assert.equal(finalizeSessionRecord(session, start + 300_000, false, 'main').durationSeconds, 65);
  assert.equal(finalizeSessionRecord(session, start + 300_000, false, 'main', 10_000).durationSeconds, 15);
});

test('activity after a long idle gap cannot count the idle interval', () => {
  const session = recordActivityBurst(pending(), start + 120_000);
  assert.equal(finalizeSessionRecord(session, start + 125_000, false, 'main').durationSeconds, 65);
  const custom = recordActivityBurst(pending(), start + 20_000, 10_000);
  assert.equal(finalizeSessionRecord(custom, start + 25_000, false, 'main', 10_000).durationSeconds, 15);
});

test('live sessions grow before persistence without finalizing focus sessions', () => {
  const activity = new EventEmitter();
  const inactivity = new EventEmitter();
  const saved = [];
  let finalizations = 0;
  let completionEvents = 0;
  const manager = new SessionManager(
    { onActivity: activity.event, onInactivity: inactivity.event },
    {
      finalizeSession: (session, end, branch) => {
        finalizations += 1;
        return finalizeSessionRecord(session, end, true, branch);
      },
      persistSession: (session) => saved.push(session),
    },
    { getProjectContext: () => ({ projectName: 'project', projectPath: '/project' }), onSessionEnd: () => {} },
    { getCurrentLanguage: () => 'TypeScript', onSessionEnd: () => {} },
    { getCurrentBranch: () => 'main' },
  );
  manager.onDidEndSession(() => {
    completionEvents += 1;
    assert.equal(saved.length, 1, 'dashboard refresh must run after the saved aggregate is available');
  });
  assert.equal(manager.getCurrentSession(start), null);
  manager.handleActivity(start);
  manager.handleActivity(start + 5_000);
  const snapshot = manager.getPendingSession();
  const live = manager.getCurrentSession(start + 10_000);
  assert.equal(live.durationSeconds, 10);
  assert.equal(live.isFocusSession, false);
  assert.equal(manager.getCurrentSession(start + 15_000).durationSeconds, 15);
  assert.equal(manager.getCurrentSession(start + 300_000).durationSeconds, 65);
  assert.deepEqual(manager.getPendingSession(), snapshot);
  assert.equal(finalizations, 0);
  assert.deepEqual(saved, []);
  assert.deepEqual(manager.getCompletedSessions(), []);
  manager.handleInactivity(start + 65_000);
  assert.equal(finalizations, 1);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].durationSeconds, 65);
  assert.equal(completionEvents, 1);
  assert.equal(manager.getCurrentSession(start + 66_000), null);
});

test('focus classification counts normal pauses and respects the configured minimum', () => {
  let session = pending();
  for (let elapsed = 5_000; elapsed < 300_000; elapsed += 5_000) {
    session = recordActivityBurst(session, start + elapsed);
  }
  const detector = new FocusDetector({ read: () => ({ daily: {} }) }, async () => undefined);
  assert.equal(detector.finalizeSession(session, start + 300_000, 'main').isFocusSession, false);
  mock.settings.focusSessionMinutes = 5;
  try {
    const completed = detector.finalizeSession(session, start + 300_000, 'main');
    assert.equal(completed.durationSeconds, 300);
    assert.equal(completed.isFocusSession, true);
  } finally {
    delete mock.settings.focusSessionMinutes;
  }
});
