import { ProjectStats, SessionRecord } from '../storage/schema';

export const UNTITLED_PROJECT_NAME = 'Untitled / Scratch';
export const UNTITLED_PROJECT_PATH = 'untitled://scratch';

/** Resolved workspace project metadata. */
export interface ProjectContext {
  projectName: string;
  projectPath: string;
}

/** Minimal workspace folder shape for project resolution. */
export interface WorkspaceFolderLike {
  name: string;
  uri: { fsPath: string };
}

/**
 * Resolves the active project from workspace folders and the open document.
 *
 * @param workspaceFolders - Open workspace folders, if any.
 * @param activeDocumentPath - Path of the active editor document.
 * @param getWorkspaceFolder - Resolver for the folder containing a file path.
 * @returns Project name and path, or untitled scratch fallback values.
 */
export function resolveProjectContext(
  workspaceFolders: readonly WorkspaceFolderLike[] | undefined,
  activeDocumentPath: string | undefined,
  getWorkspaceFolder: (filePath: string) => WorkspaceFolderLike | undefined,
): ProjectContext {
  if (activeDocumentPath) {
    const folder = getWorkspaceFolder(activeDocumentPath);
    if (folder) {
      return {
        projectName: folder.name,
        projectPath: folder.uri.fsPath,
      };
    }
  }

  if (workspaceFolders && workspaceFolders.length > 0) {
    const folder = workspaceFolders[0];
    return {
      projectName: folder.name,
      projectPath: folder.uri.fsPath,
    };
  }

  return {
    projectName: UNTITLED_PROJECT_NAME,
    projectPath: UNTITLED_PROJECT_PATH,
  };
}

/**
 * Applies project stats updates for a completed session.
 *
 * @param projects - Current project stats map from storage.
 * @param session - Completed session record.
 * @returns Updated project stats map.
 */
export function applyProjectSessionUpdate(
  projects: Record<string, ProjectStats>,
  session: SessionRecord,
): Record<string, ProjectStats> {
  const key = session.projectPath;
  const existing = projects[key];

  const project = existing ?? {
    projectName: session.projectName,
    projectPath: session.projectPath,
    totalSeconds: 0,
    lastOpened: session.endTime,
    sessions: [],
    languages: {},
  };

  return {
    ...projects,
    [key]: {
      ...project,
      projectName: session.projectName,
      sessions: [...project.sessions, session],
      totalSeconds: project.totalSeconds + session.durationSeconds,
      lastOpened: session.endTime,
      languages: {
        ...project.languages,
        [session.language]: (project.languages[session.language] ?? 0) + session.durationSeconds,
      },
    },
  };
}
