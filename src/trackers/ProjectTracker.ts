import * as vscode from 'vscode';
import { ProjectStats, SessionRecord } from '../storage/schema';
import { StorageManager } from '../storage/StorageManager';
import {
  ProjectContext,
  applyProjectSessionUpdate,
  resolveProjectContext,
} from './projectLogic';

/**
 * Tracks workspace project context and persists project-level session stats.
 */
export class ProjectTracker {
  /**
   * Creates a project tracker backed by local storage.
   *
   * @param storageManager - Storage manager used to read and write project stats.
   */
  constructor(private readonly storageManager: StorageManager) {}

  /**
   * Returns the display name of the current workspace project.
   *
   * @returns Current project name or {@code Untitled / Scratch} when no workspace is open.
   */
  getCurrentProject(): string {
    return this.getProjectContext().projectName;
  }

  /**
   * Returns the absolute path of the current workspace project.
   *
   * @returns Current project path or the untitled scratch sentinel path.
   */
  getCurrentProjectPath(): string {
    return this.getProjectContext().projectPath;
  }

  /**
   * Resolves the active project name and path from VS Code workspace state.
   *
   * @returns Current project context for session attribution.
   */
  getProjectContext(): ProjectContext {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const activeDocumentPath = vscode.window.activeTextEditor?.document.uri.fsPath;

    return resolveProjectContext(
      workspaceFolders,
      activeDocumentPath,
      (filePath: string) => {
        const folder = vscode.workspace.getWorkspaceFolder(vscode.Uri.file(filePath));
        if (!folder) {
          return undefined;
        }

        return {
          name: folder.name,
          uri: { fsPath: folder.uri.fsPath },
        };
      },
    );
  }

  /**
   * Updates stored project stats when a coding session ends.
   *
   * @param session - Completed session record to merge into project stats.
   */
  onSessionEnd(session: SessionRecord): void {
    const data = this.storageManager.read();
    data.projects = applyProjectSessionUpdate(data.projects, session);
    this.storageManager.write(data);
  }

  /**
   * Returns all persisted project stats.
   *
   * @returns Project stats loaded from storage.
   */
  getStats(): ProjectStats[] {
    return Object.values(this.storageManager.read().projects);
  }
}
