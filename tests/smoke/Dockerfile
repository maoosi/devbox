# Smoke-test image: a clean Ubuntu that mimics a fresh devbox VM.
# - Non-root `devbox` user with passwordless sudo (matches Orbstack/typical setup).
# - Only `sudo` and `curl` are pre-installed; everything else (gh, bun, node,
#   pnpm, doppler, infisical) must be installed by the devbox installer itself.
#   That's the point — the smoke run validates that the installer actually works.
# - The repo is mounted at /srv/devbox and consumed by install.sh via DEVBOX_LOCAL_SRC.

FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update -qq \
 && apt-get install -y -qq --no-install-recommends sudo curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN useradd -m -s /bin/bash devbox \
 && echo "devbox ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/devbox \
 && chmod 0440 /etc/sudoers.d/devbox

USER devbox
WORKDIR /home/devbox

# Source mount + scenarios + assertions are bind-mounted by the runner script,
# not COPY'd, so iteration on the harness doesn't require image rebuilds.
