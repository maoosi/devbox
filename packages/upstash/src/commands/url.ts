import { loadConfig } from '../config';
import { ensureRunning, requireWorkspaceBox } from '../boxes';

export default async function url(argv: string[]): Promise<number> {
  const [workspace, portArg] = argv;
  const port = Number(portArg);
  if (!workspace || !portArg || !Number.isInteger(port) || port <= 0 || port > 65535) {
    console.error('Usage: devbox url <workspace> <port>');
    return 1;
  }

  const cfg = await loadConfig();
  const box = await requireWorkspaceBox(cfg, workspace);
  // Progress goes to stderr so `devbox url ws 5173 | pbcopy` captures only the URL.
  await ensureRunning(box, { log: console.error });

  const pub = await box.getPublicURL(port);

  if (process.stdout.isTTY) {
    console.log(`Opening ${pub.url}`);
    const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
    Bun.spawn([opener, pub.url], { stdout: 'ignore', stderr: 'ignore' });
  } else {
    console.log(pub.url);
  }
  return 0;
}
