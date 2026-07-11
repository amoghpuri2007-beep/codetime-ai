import { getActiveWorkspacePath, getGitApi, resolveGitBranch } from './gitLogic';

/**
 * Resolves git branch metadata for the active workspace using VS Code's git extension.
 */
export class GitTracker {
  /**
   * Returns the current git branch for the active workspace.
   *
   * @returns Branch name, or {@code no-git} when git metadata is unavailable.
   */
  getCurrentBranch(): string {
    const workspacePath = getActiveWorkspacePath();
    const gitApi = getGitApi();
    return resolveGitBranch(workspacePath, gitApi);
  }

  /**
   * Resolves a branch for a specific workspace path. Exposed for unit tests.
   *
   * @param workspacePath - Absolute workspace folder path.
   * @returns Branch name, or {@code no-git} when git metadata is unavailable.
   */
  getBranchForWorkspace(workspacePath: string | undefined): string {
    return resolveGitBranch(workspacePath, getGitApi());
  }
}
