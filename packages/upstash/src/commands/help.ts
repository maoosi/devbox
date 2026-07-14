const HELP = `devbox — disposable remote dev environments on Upstash Box

Usage: devbox <command> [args]

Setup
  init                       Create + provision the project's base box, then SSH in
                             (--no-ssh to skip the SSH session)
  snapshot                   Freeze the base box as the base snapshot (--force to replace)

Daily workflow
  create <ws> [--branch B]   Create workspace <ws> from the base snapshot (idempotent)
  list                       List this project's boxes (name, status, branch, age)
  info <ws>                  Show status, SSH command, public URLs, branch, age
  ssh <ws>                   SSH into the workspace
  exec <ws> -- <cmd...>      Run a command in the workspace without SSH
  pull <ws> [--stat]         Apply the workspace's uncommitted changes to the local
                             checkout as a git patch (--stat to preview only)
  open <ws> [--editor E]     Open in your editor (zed | code)
  url <ws> <port>            Create a public URL for a port (opens browser when in a TTY)
  delete <ws>                Delete the workspace

Maintenance
  reset [--yes]              Delete the base snapshot + ALL project boxes (asks to confirm)
  doctor                     Diagnose config, credentials, CLIs, and remote state
  help                       Show this help

Configuration — ./devbox.ts:

  import { devbox, bun, pnpm, pulumi, infisical, doppler, command } from 'devbox';

  export default devbox({
    name: 'kuizto',
    workdir: 'kuizto-platform',
    mode: 'write',
    repository: {
      slug: 'kuizto/kuizto-platform',
      branch: 'next',
      token: process.env.GITHUB_TOKEN,   // clone auth + GitHub MCP; omit for public repos
    },
    secrets: [infisical({ token: process.env.INFISICAL_TOKEN! })],
    toolchain: [bun(), pnpm(), pulumi()],
    setup: [pulumi.install({ cwd: 'infra', noDependencies: true }), command('bun install')],
    editor: 'zed',
  });

Credentials — ./devbox.local.env (gitignore it) or the shell env; shell wins:

  UPSTASH_BOX_API_KEY=...    Required. Also the SSH password for boxes.
  GITHUB_TOKEN=...           Referenced by devbox.ts (repository.token).
  INFISICAL_TOKEN=...        Referenced by devbox.ts (secrets).

Notes
  - Secret tokens and the git remote URL are baked into the base snapshot; after
    rotating tokens or changing the config, run 'devbox init' then 'devbox snapshot
    --force'. Existing workspaces keep the old values.
`;

export default async function help(_argv: string[]): Promise<number> {
  console.log(HELP);
  return 0;
}
