#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# 🚀 Devbox Bootstrap
# ─────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║        🚀  Devbox Bootstrap  🚀         ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# ─────────────────────────────────────────────
# 📦 System Packages
# ─────────────────────────────────────────────

echo "📦  Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo ""
echo "🔧  Installing base dev packages..."
sudo apt install -y \
  build-essential \
  curl \
  wget \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common \
  apt-transport-https \
  unzip \
  zip \
  git

echo ""
echo "✅  System packages ready"
echo ""

# ─────────────────────────────────────────────
# 🐙 Git & GitHub CLI
# ─────────────────────────────────────────────

echo "🐙  Installing GitHub CLI (gh)..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg >/dev/null
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
sudo apt update
sudo apt install -y gh

echo "✅  GitHub CLI installed"
echo ""

# ─────────────────────────────────────────────
# 🟢 Node.js (fnm + LTS)
# ─────────────────────────────────────────────

echo "🟢  Installing fnm (Fast Node Manager)..."
curl -fsSL https://fnm.vercel.app/install | bash

FNM_PATH="$HOME/.local/share/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
else
  echo "❌  ERROR: fnm install did not create expected directory: $FNM_PATH" >&2
  exit 1
fi

if ! command -v fnm >/dev/null 2>&1; then
  echo "❌  ERROR: fnm is still not on PATH. Try: source ~/.bashrc and re-run." >&2
  exit 1
fi

eval "$(fnm env --shell bash)"

echo "🟢  Installing Node.js (LTS) via fnm..."
fnm install --lts
fnm default lts-latest

echo "✅  Node.js ready ($(node -v))"
echo ""

# ─────────────────────────────────────────────
# 📦 Package Managers (pnpm + Bun)
# ─────────────────────────────────────────────

echo "📦  Installing pnpm..."
curl -fsSL https://get.pnpm.io/install.sh | sh -
export PNPM_HOME="$HOME/.local/share/pnpm"
export PATH="$PNPM_HOME:$PATH"

echo "🍞  Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

echo "✅  pnpm ($(pnpm -v)) + Bun ($(bun -v)) ready"
echo ""

# ─────────────────────────────────────────────
# ⚡ Vite+ (alpha) — unified JS toolchain
# ─────────────────────────────────────────────

echo "⚡  Installing Vite+ (alpha)..."
curl -fsSL https://vite.plus | bash

echo "✅  Vite+ alpha ready (vp)"
echo ""

# ─────────────────────────────────────────────
# 🐳 Docker
# ─────────────────────────────────────────────

echo "🐳  Installing Docker..."
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"

echo "✅  Docker installed"
echo ""

# ─────────────────────────────────────────────
# 🤖 AI Tooling (Claude Code)
# ─────────────────────────────────────────────

echo "🤖  Installing Claude Code CLI..."
bun install -g @anthropic-ai/claude-code || npm install -g @anthropic-ai/claude-code

echo "✅  Claude Code CLI installed"
echo ""

# ─────────────────────────────────────────────
# 🔐 Secrets Management (Infisical + Doppler)
# ─────────────────────────────────────────────

echo "🔐  Installing Infisical CLI..."
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
sudo apt update
sudo apt install -y infisical

echo "🔐  Installing Doppler CLI..."
curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | sudo gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/doppler-cli.list
sudo apt-get update && sudo apt-get install -y doppler

echo "✅  Secrets management CLIs installed"
echo ""

# ─────────────────────────────────────────────
# ⌨️  Shell Aliases
# ─────────────────────────────────────────────

echo "⌨️   Setting up shell aliases..."

BASHRC="$HOME/.bashrc"

add_alias() {
  local alias_line="alias $1='$2'"
  if ! grep -qF "$alias_line" "$BASHRC" 2>/dev/null; then
    echo "$alias_line" >> "$BASHRC"
    echo "    ➕  Added alias: $1 → $2"
  else
    echo "    ⏭️   Alias already exists: $1"
  fi
}

add_alias "cls" "clear"

echo "✅  Shell aliases configured"
echo ""

# ─────────────────────────────────────────────
# 🧠 Claude Code Config (.claude/)
# ─────────────────────────────────────────────

DEVBOX_REPO="maoosi/devbox"
DEVBOX_BRANCH="main"
CLAUDE_DIR="$HOME/.claude"

echo "🧠  Installing Claude Code config to $CLAUDE_DIR..."

CLAUDE_FILES=$(curl -fsSL "https://api.github.com/repos/$DEVBOX_REPO/git/trees/$DEVBOX_BRANCH?recursive=1" \
  | grep '"path"' | grep '\.claude/' | sed 's/.*"path": "\(.*\)".*/\1/')

for file in $CLAUDE_FILES; do
  # Skip directory entries (no extension)
  if [[ "$file" == */ ]]; then
    continue
  fi

  target="$HOME/$file"
  target_dir="$(dirname "$target")"
  mkdir -p "$target_dir"

  curl -fsSL "https://raw.githubusercontent.com/$DEVBOX_REPO/$DEVBOX_BRANCH/$file" -o "$target"
  echo "    📄  $file"
done

echo "✅  Claude Code config installed"
echo ""

# ─────────────────────────────────────────────
# 🏁 Done
# ─────────────────────────────────────────────

echo "╔══════════════════════════════════════════╗"
echo "║        🏁  Bootstrap Complete  🏁       ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "👉  Next steps:"
echo ""
echo "   source ~/.bashrc"
echo ""
echo "   gh auth login"
echo "   infisical login"
echo "   doppler login"
echo "   claude login"
echo ""
echo "   docker run hello-world"
echo "   node -v && pnpm -v && bun -v && vp --version"
echo ""
echo "   git config --global user.name \"Your Name\""
echo "   git config --global user.email \"you@example.com\""
echo ""
