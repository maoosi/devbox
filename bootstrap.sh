#!/usr/bin/env bash
set -euo pipefail

echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

echo "Installing base dev packages..."
sudo apt install -y \
  build-essential \
  curl \
  wget \
  ca-certificates \
  gnupg \
  lsb-release \
  software-properties-common \
  unzip \
  zip \
  git

echo "Installing GitHub CLI (gh)..."
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
  | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg >/dev/null
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
  | sudo tee /etc/apt/sources.list.d/github-cli.list >/dev/null
sudo apt update
sudo apt install -y gh

echo "Installing fnm (Fast Node Manager)..."
curl -fsSL https://fnm.vercel.app/install | bash

# Make fnm available immediately in this script session (no need to restart terminal)
FNM_PATH="$HOME/.local/share/fnm"
if [ -d "$FNM_PATH" ]; then
  export PATH="$FNM_PATH:$PATH"
else
  echo "ERROR: fnm install did not create expected directory: $FNM_PATH" >&2
  exit 1
fi

# Ensure fnm is now available
if ! command -v fnm >/dev/null 2>&1; then
  echo "ERROR: fnm is still not on PATH. Try: source ~/.bashrc and re-run." >&2
  exit 1
fi

# Configure current shell env for fnm
eval "$(fnm env --shell bash)"

echo "Installing Node.js (LTS) via fnm..."
fnm install --lts
fnm default lts-latest

echo "Installing Bun..."
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

echo "Installing Docker..."
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"

echo "Installing Claude Code CLI..."
# Try bun first, fallback to npm (works once Node is installed)
bun install -g @anthropic-ai/claude-code || npm install -g @anthropic-ai/claude-code

echo "Installing Infisical CLI..."
# Add Infisical apt repository
curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.deb.sh' | sudo -E bash
# Install CLI
sudo apt update
sudo apt install -y infisical

echo "Installing Doopler CLI..."
sudo apt-get update && sudo apt-get install -y apt-transport-https
curl -sLf --retry 3 --tlsv1.2 --proto "=https" 'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | sudo gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg
echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] https://packages.doppler.com/public/cli/deb/debian any-version main" | sudo tee /etc/apt/sources.list.d/doppler-cli.list
sudo apt-get update && sudo apt-get install doppler

echo ""
echo "Next:"
echo "• source ~/.bashrc"
echo "• gh auth login"
echo "• infisical login"
echo "• doppler login"
echo "• claude login"
echo "• docker run hello-world"
echo "• node -v && bun -v"
echo "• git config --global user.name \"Your Name\""
echo "• git config --global user.email \"you@example.com\""
echo ""
