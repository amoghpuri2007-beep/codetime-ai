import * as vscode from 'vscode';

/** Minimal git repository shape exposed by the VS Code git extension. */
export interface GitRepositoryLike {
  rootUri: { fsPath: string };
  state: {
    HEAD?: { name?: string };
  };
}

/** Minimal git API shape exposed by the VS Code git extension. */
export interface GitApiLike {
  repositories: GitRepositoryLike[];
}

/** Fallback branch value when git metadata is unavailable. */
export const NO_GIT_BRANCH = 'no-git';

/**
 * Finds the git repository that contains the supplied workspace path.
 *
 * @param workspacePath - Absolute workspace folder path.
 * @param repositories - Git repositories from the VS Code git extension.
 * @returns Matching repository or undefined.
 */
export function findRepositoryForWorkspace(
  workspacePath: string | undefined,
  repositories: GitRepositoryLike[],
): GitRepositoryLike | undefined {
  if (!workspacePath) {
    return repositories[0];
  }

  const normalizedWorkspacePath = workspacePath.toLowerCase();
  let bestMatch: GitRepositoryLike | undefined;
  let bestMatchLength = -1;

  for (const repository of repositories) {
    const rootPath = repository.rootUri.fsPath.toLowerCase();
    const isMatch =
      normalizedWorkspacePath === rootPath ||
      normalizedWorkspacePath.startsWith(`${rootPath}/`) ||
      normalizedWorkspacePath.startsWith(`${rootPath}\\`);

    if (isMatch && rootPath.length > bestMatchLength) {
      bestMatch = repository;
      bestMatchLength = rootPath.length;
    }
  }

  return bestMatch ?? repositories[0];
}

/**
 * Resolves the current git branch for a workspace path.
 *
 * @param workspacePath - Absolute workspace folder path.
 * @param gitApi - VS Code git API, if available.
 * @returns Branch name or {@link NO_GIT_BRANCH} when unavailable.
 */
export function resolveGitBranch(
  workspacePath: string | undefined,
  gitApi: GitApiLike | undefined,
): string {
  if (!gitApi || gitApi.repositories.length === 0) {
    return NO_GIT_BRANCH;
  }

  const repository = findRepositoryForWorkspace(workspacePath, gitApi.repositories);
  const branchName = repository?.state.HEAD?.name;

  return branchName && branchName.length > 0 ? branchName : NO_GIT_BRANCH;
}

/**
 * Reads the VS Code git extension API synchronously when already active.
 *
 * @returns Git API instance or undefined when unavailable.
 */
export function getGitApi(): GitApiLike | undefined {
  const gitExtension = vscode.extensions.getExtension<{ getAPI(version: number): GitApiLike }>(
    'vscode.git',
  );

  if (!gitExtension?.isActive) {
    return undefined;
  }

  try {
    return gitExtension.exports.getAPI(1);
  } catch {
    return undefined;
  }
}

/**
 * Returns the workspace path for the active editor, if available.
 *
 * @returns Absolute workspace folder path or undefined.
 */
export function getActiveWorkspacePath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    const folders = vscode.workspace.workspaceFolders;
    return folders?.[0]?.uri.fsPath;
  }

  return vscode.workspace.getWorkspaceFolder(editor.document.uri)?.uri.fsPath;
}
