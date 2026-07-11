import * as vscode from 'vscode';

/** Editor metadata captured for a coding session. */
export interface EditorContext {
  language: string;
  projectName: string;
  projectPath: string;
}

/**
 * Resolves editor metadata from a text editor and optional workspace folder.
 *
 * @param editor - Active VS Code text editor, if any.
 * @param workspaceFolder - Workspace folder containing the open document.
 * @returns Normalized editor context for session tracking.
 */
export function resolveEditorContext(
  editor: vscode.TextEditor | undefined,
  workspaceFolder: vscode.WorkspaceFolder | undefined,
): EditorContext {
  if (!editor) {
    return {
      language: 'unknown',
      projectName: 'unknown',
      projectPath: 'unknown',
    };
  }

  if (!workspaceFolder) {
    return {
      language: editor.document.languageId,
      projectName: 'unknown',
      projectPath: editor.document.uri.fsPath,
    };
  }

  return {
    language: editor.document.languageId,
    projectName: workspaceFolder.name,
    projectPath: workspaceFolder.uri.fsPath,
  };
}

/**
 * Reads the current active editor context from VS Code APIs.
 *
 * @returns Editor context for the currently focused text editor.
 */
export function getActiveEditorContext(): EditorContext {
  const editor = vscode.window.activeTextEditor;
  const workspaceFolder = editor
    ? vscode.workspace.getWorkspaceFolder(editor.document.uri)
    : undefined;

  return resolveEditorContext(editor, workspaceFolder ?? undefined);
}
