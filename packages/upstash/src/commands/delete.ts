import { loadConfig } from '../config';
import { findBoxByName } from '../boxes';
import { NAME_RE, workspaceBoxName } from '../names';

export default async function del(argv: string[]): Promise<number> {
  const workspace = argv[0];
  if (!workspace) {
    console.error('Usage: devbox delete <workspace>');
    return 1;
  }
  if (!NAME_RE.test(workspace)) {
    console.error(`Invalid workspace name '${workspace}' (allowed: ${NAME_RE})`);
    return 1;
  }

  const cfg = await loadConfig();
  const box = await findBoxByName(workspaceBoxName(cfg.name, workspace));
  if (!box) {
    console.log(`Workspace '${workspace}' does not exist — nothing to delete.`);
    return 0;
  }

  await box.delete();
  console.log(`Workspace '${workspace}' deleted (${box.id}).`);
  return 0;
}
