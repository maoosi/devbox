// Copy this file to your project root as `devbox.ts`.
// Credentials live in ./devbox.local.env next to this file (gitignore it!)
// or in your shell env — the shell wins:
//   UPSTASH_BOX_API_KEY=...   required
//   GITHUB_TOKEN=...          for private clones + GitHub MCP
//   INFISICAL_TOKEN=...       if using infisical()
//   DOPPLER_TOKEN=...         if using doppler()
import { devbox, bun, pnpm, pulumi, infisical, doppler, command } from 'devbox';

export default devbox({
  name: 'kuizto',
  workdir: 'kuizto-platform',

  mode: 'write',

  repository: {
    slug: 'kuizto/kuizto-platform',
    branch: 'next',
    token: process.env.GITHUB_TOKEN,
  },

  secrets: [
    infisical({
      token: process.env.INFISICAL_TOKEN!,
    }),

    doppler({
      token: process.env.DOPPLER_TOKEN!,
    }),
  ],

  toolchain: [bun(), pnpm(), pulumi()],

  setup: [
    pulumi.install({
      cwd: 'infra',
      noDependencies: true,
    }),

    command('bun install'),
  ],

  editor: 'zed',
});
