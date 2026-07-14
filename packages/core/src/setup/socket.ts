import type { Executor } from '../executor';
import type { SetupStatus } from '../types';
import { ensureLine, run, runScript, writeFile } from '../lib';

/**
 * Socket Firewall (`sfw`) wraps install-like subcommands of the common package
 * managers and blocks known-malicious packages at install. Runtime subcommands
 * (run/dev/test/…) bypass sfw so tools they spawn (Doppler, gh, anything
 * Go-built) stay out of sfw's MITM proxy and validate against the real public
 * cert chain. Bun is not supported.
 *
 * The wrappers are shell functions sourced by ~/.bashrc — they apply to
 * interactive SSH / in-box agent shells. Automated provisioning runs direct
 * (through `runScript`, not these functions) so setup stays reliable;
 * ignore-scripts still protects those installs.
 */
const WRAPPERS = `# devbox: route install-like package-manager subcommands through Socket Firewall (sfw)
# Everything else passes through to the real binary — keeps dev servers and the
# tools they spawn (Doppler, gh, …) out of sfw's MITM proxy, where Go binaries
# fail the cert handshake.

# Print the first positional arg, skipping -flags. Recognises a few
# common value-taking flags (pnpm/yarn --filter web install …) so the
# subcommand isn't confused with a flag value. "--" forces positional.
# Empty output if there is no positional arg.
_devbox_first_pos() {
  while [ $# -gt 0 ]; do
    case "$1" in
      --) shift; printf '%s' "\${1:-}"; return ;;
      --filter|--filter-prod|-F|--workspace|-w|--cwd|-C|--config|-c|--registry|--reporter|--loglevel)
        shift; [ $# -gt 0 ] && shift ;;
      -*) shift ;;
      *)  printf '%s' "$1"; return ;;
    esac
  done
}

# True iff $2 matches one of the | -separated words in $1.
_devbox_sfw_match() {
  local pat="^($1)$"
  [[ "$2" =~ $pat ]]
}

npm() {
  if _devbox_sfw_match "install|i|ci|add|update|upgrade|up|rebuild|rb|install-test|it" "$(_devbox_first_pos "$@")"; then
    sfw npm "$@"
  else
    command npm "$@"
  fi
}

pnpm() {
  local sub; sub="$(_devbox_first_pos "$@")"
  if [ -z "$sub" ] || _devbox_sfw_match "install|i|add|update|up|import|dlx|rebuild" "$sub"; then
    sfw pnpm "$@"
  else
    command pnpm "$@"
  fi
}

yarn() {
  local sub; sub="$(_devbox_first_pos "$@")"
  if [ -z "$sub" ] || _devbox_sfw_match "install|add|upgrade|up|import|create|dlx" "$sub"; then
    sfw yarn "$@"
  else
    command yarn "$@"
  fi
}

pip() {
  if _devbox_sfw_match "install|download|wheel" "$(_devbox_first_pos "$@")"; then
    sfw pip "$@"
  else
    command pip "$@"
  fi
}

uv() {
  if _devbox_sfw_match "add|sync|lock|pip" "$(_devbox_first_pos "$@")"; then
    sfw uv "$@"
  else
    command uv "$@"
  fi
}

cargo() {
  if _devbox_sfw_match "add|install|update|fetch" "$(_devbox_first_pos "$@")"; then
    sfw cargo "$@"
  else
    command cargo "$@"
  fi
}
`;

export async function setupSocket(exec: Executor): Promise<SetupStatus> {
  const hasSfw = (await run(exec, `command -v sfw >/dev/null 2>&1`)).exitCode === 0;
  if (!hasSfw) {
    await runScript(exec, `npm install -g sfw`);
  }
  // The wrappers are a managed artifact — always (re)written so fixes ship.
  await writeFile(exec, '$HOME/.config/devbox/aliases.sh', WRAPPERS);
  await ensureLine(
    exec,
    '$HOME/.bashrc',
    'devbox/aliases',
    '[ -f "$HOME/.config/devbox/aliases.sh" ] && . "$HOME/.config/devbox/aliases.sh" # devbox/aliases',
  );
  return hasSfw
    ? { kind: 'reused', note: 'sfw already installed; wrappers refreshed' }
    : { kind: 'installed' };
}
