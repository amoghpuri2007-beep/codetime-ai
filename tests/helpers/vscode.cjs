const Module = require('node:module');

class EventEmitter {
  constructor() {
    this.listeners = new Set();
    this.event = (listener) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
  }

  fire(value) {
    for (const listener of this.listeners) listener(value);
  }

  dispose() {
    this.listeners.clear();
  }
}

function document(fsPath = '/project/index.ts', languageId = 'typescript') {
  return {
    languageId,
    isClosed: false,
    isUntitled: false,
    uri: { scheme: 'file', fsPath, path: fsPath, toString: () => `file://${fsPath}` },
  };
}

function installVSCodeMock() {
  const events = Object.fromEntries([
    'changeDocument', 'saveDocument', 'activeEditor', 'selection', 'visibleRanges',
    'windowState', 'configuration',
  ].map((name) => [name, new EventEmitter()]));
  const settings = {};
  const commands = new Map();
  const commandCalls = [];
  const statusBars = [];
  const panels = [];
  const vscode = {
    EventEmitter,
    Uri: { file: (fsPath) => document(fsPath).uri },
    StatusBarAlignment: { Left: 1, Right: 2 },
    ViewColumn: { One: 1 },
    ThemeColor: class ThemeColor { constructor(id) { this.id = id; } },
    extensions: { getExtension: () => undefined },
    commands: {
      registerCommand: (name, callback) => {
        commands.set(name, callback);
        return { dispose: () => commands.delete(name) };
      },
      executeCommand: async (name, ...args) => {
        commandCalls.push({ name, args });
        return commands.get(name)?.(...args);
      },
    },
    window: {
      state: { focused: true },
      activeTextEditor: { document: document() },
      onDidChangeActiveTextEditor: events.activeEditor.event,
      onDidChangeTextEditorSelection: events.selection.event,
      onDidChangeTextEditorVisibleRanges: events.visibleRanges.event,
      onDidChangeWindowState: events.windowState.event,
      showInformationMessage: async () => undefined,
      createStatusBarItem: () => {
        const item = {
          text: '', tooltip: '', command: undefined, visible: false, disposed: false,
          show() { this.visible = true; },
          hide() { this.visible = false; },
          dispose() { this.disposed = true; },
        };
        statusBars.push(item);
        return item;
      },
      createWebviewPanel: () => {
        const receive = new EventEmitter();
        const dispose = new EventEmitter();
        const viewState = new EventEmitter();
        const panel = {
          visible: true,
          disposed: false,
          webview: {
            html: '', cspSource: 'vscode-webview://test', messages: [],
            onDidReceiveMessage: receive.event,
            async postMessage(message) { this.messages.push(message); return true; },
          },
          async receiveMessage(message) {
            for (const listener of receive.listeners) await listener(message);
          },
          onDidDispose: dispose.event,
          onDidChangeViewState: viewState.event,
          reveal() { this.visible = true; viewState.fire({ webviewPanel: this }); },
          dispose() { this.disposed = true; dispose.fire(); },
        };
        panels.push(panel);
        return panel;
      },
    },
    workspace: {
      onDidChangeTextDocument: events.changeDocument.event,
      onDidSaveTextDocument: events.saveDocument.event,
      onDidChangeConfiguration: events.configuration.event,
      getConfiguration: () => ({ get: (key, fallback) => settings[key] ?? fallback }),
      getWorkspaceFolder: () => ({ name: 'project', uri: { fsPath: '/project' } }),
      workspaceFolders: [{ name: 'project', uri: { fsPath: '/project' } }],
    },
  };
  const originalLoad = Module._load;
  Module._load = function load(request, parent, isMain) {
    return request === 'vscode' ? vscode : originalLoad.call(this, request, parent, isMain);
  };
  return {
    vscode, events, settings, commands, commandCalls, statusBars, panels,
    restore: () => { Module._load = originalLoad; },
  };
}

module.exports = { EventEmitter, document, installVSCodeMock };
