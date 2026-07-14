/** Naming conventions — the only "state": names on Upstash are the source of truth. */

export const NAME_RE = /^[a-z0-9-]+$/;

export const baseBoxName = (project: string) => `devbox-${project}`;

export const workspaceBoxName = (project: string, workspace: string) =>
  `devbox-${project}-${workspace}`;

export const snapshotName = (project: string) => `devbox-${project}-base`;

/** Matches the base box and every workspace of this project — never another project. */
export const belongsToProject = (project: string, boxName: string | undefined) =>
  !!boxName && (boxName === baseBoxName(project) || boxName.startsWith(`${baseBoxName(project)}-`));

/** `devbox-{project}-{ws}` → `{ws}`; the base box → `(base)`. */
export function workspaceId(project: string, boxName: string): string {
  if (boxName === baseBoxName(project)) return '(base)';
  return boxName.slice(baseBoxName(project).length + 1);
}
