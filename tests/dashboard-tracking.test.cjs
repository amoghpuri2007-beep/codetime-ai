const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { test, after } = require('node:test');
const { installVSCodeMock } = require('./helpers/vscode.cjs');
const mock = installVSCodeMock();
after(mock.restore);
let executeCommand = async () => undefined;
mock.vscode.commands = { executeCommand: (...args) => executeCommand(...args) };
const { formatTrackingStatus } = require('../out/core/trackingStatus.js');
const { DashboardPanel } = require('../out/dashboard/DashboardPanel.js');
const { StorageManager } = require('../out/storage/StorageManager.js');

test('tracking labels explain each automatic or manual pause reason', () => {
  const labels = {
    tracking: 'Tracking · TypeScript',
    idle: 'Paused · Idle',
    'window-inactive': 'Paused · Window inactive',
    'no-editor': 'Paused · No editor',
    'unsupported-editor': 'Paused · Unsupported editor',
    manual: 'Paused · Manual',
  };
  for (const [state, label] of Object.entries(labels)) {
    assert.equal(formatTrackingStatus({ state, language: 'TypeScript' }), label);
  }
  assert.equal(formatTrackingStatus({ state: 'tracking', language: null }), 'Tracking');
});

test('dashboard displays live tracking state and sends pause/resume through extension commands', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codetime-dashboard-status-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const messages = [];
  const commands = [];
  let receiveMessage;
  let status = { state: 'tracking', language: 'TypeScript' };
  executeCommand = async (command) => {
    commands.push(command);
    status = command === 'codetime-ai.pauseTracking'
      ? { state: 'manual', language: null }
      : { state: 'idle', language: null };
  };
  const panel = {
    webview: {
      cspSource: 'test', html: '',
      onDidReceiveMessage: (listener) => { receiveMessage = listener; },
      postMessage: (message) => { messages.push(message); return Promise.resolve(true); },
    },
    onDidChangeViewState: () => {},
    onDidDispose: () => {},
  };
  const dashboard = new DashboardPanel(
    panel,
    new StorageManager({ fsPath: directory }),
    { getLatestInsight: () => null },
    () => null,
    () => status,
  );
  assert.equal(messages.at(-1).trackingStatusLabel, 'Tracking · TypeScript');
  assert.equal(messages.at(-1).data.stats.total, '0s');

  const elements = new Map();
  const htmlWrites = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const node = {
        textContent: '', style: {}, dataset: {}, attributes: {}, handlers: {},
        setAttribute(name, value) { this.attributes[name] = value; },
        addEventListener(name, handler) { this.handlers[name] = handler; },
      };
      let html = '';
      Object.defineProperty(node, 'innerHTML', {
        get: () => html,
        set: (value) => { html = value; htmlWrites.set(id, (htmlWrites.get(id) ?? 0) + 1); },
      });
      elements.set(id, node);
    }
    return elements.get(id);
  };
  const requests = [];
  let receiveUpdate;
  let renderNow = 10_000;
  let chartConstructions = 0;
  let chartDestructions = 0;
  const script = panel.webview.html.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInNewContext(script, {
    document: { getElementById: element },
    window: { addEventListener: (_event, listener) => { receiveUpdate = listener; } },
    acquireVsCodeApi: () => ({ postMessage: (message) => requests.push(message) }),
    Date: class extends Date { static now() { return renderNow; } },
    Chart: class {
      constructor() { chartConstructions += 1; }
      destroy() { chartDestructions += 1; }
    },
  });
  receiveUpdate({ data: messages.at(-1) });
  assert.equal(element('trackingStatus').textContent, 'Tracking · TypeScript');
  assert.equal(element('trackingStatus').dataset.state, 'tracking');
  assert.equal(element('toggleTrackingBtn').textContent, 'Pause');

  element('toggleTrackingBtn').handlers.click();
  assert.equal(requests.at(-1).type, 'pauseTracking');
  await receiveMessage(requests.at(-1));
  receiveUpdate({ data: messages.at(-1) });
  assert.equal(element('trackingStatus').textContent, 'Paused · Manual');
  assert.equal(element('toggleTrackingBtn').textContent, 'Resume');
  assert.equal(element('toggleTrackingBtn').attributes['aria-label'], 'Resume tracking');

  element('toggleTrackingBtn').handlers.click();
  await receiveMessage(requests.at(-1));
  receiveUpdate({ data: messages.at(-1) });
  assert.deepEqual(commands, ['codetime-ai.pauseTracking', 'codetime-ai.resumeTracking']);
  assert.equal(element('trackingStatus').textContent, 'Paused · Idle');
  assert.equal(element('toggleTrackingBtn').textContent, 'Pause', 'automatic pauses must not offer manual Resume');

  status = { state: 'tracking', language: '<img src=x onerror=alert(1)>' };
  dashboard.sendData();
  receiveUpdate({ data: messages.at(-1) });
  assert.equal(element('trackingStatus').textContent, 'Tracking · <img src=x onerror=alert(1)>');
  assert.equal(element('trackingStatus').innerHTML, '', 'status text must not be interpreted as HTML');

  const unchangedWrites = Object.fromEntries(['insightContent', 'projectsList', 'sessionsBody'].map((id) => [id, htmlWrites.get(id)]));
  assert.equal(chartConstructions, 3);
  for (let seconds = 1; seconds <= 5; seconds += 1) {
    renderNow += 1000;
    const update = structuredClone(messages.at(-1));
    update.data.stats.today = `${seconds}s`;
    update.data.languages = [{ language: 'Python', seconds, percentage: 100 }];
    receiveUpdate({ data: update });
    assert.equal(element('statToday').textContent, `${seconds}s`, 'stopwatch text must update on every tick');
    for (const [id, count] of Object.entries(unchangedWrites)) {
      assert.equal(htmlWrites.get(id), count, `${id} should retain its unchanged DOM`);
    }
    assert.equal(chartConstructions, seconds < 5 ? 3 : 6, 'charts should update at most once every five seconds');
  }
  assert.equal(chartDestructions, 3);
});
