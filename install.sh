#!/bin/sh
# drdeploy installer.
#
# Downloads the right pre-built binary from GitHub Releases for the current
# platform and drops it in $PREFIX (default /usr/local/bin).
#
# Usage:
#   curl -fsSL https://drdeploy.dev/install | sh
#   curl -fsSL https://drdeploy.dev/install | PREFIX=$HOME/.local/bin sh
#   curl -fsSL https://drdeploy.dev/install | VERSION=v0.1.0 sh

set -e

REPO="${REPO:-Dr-Deploy/drdeploy}"
PREFIX="${PREFIX:-/usr/local/bin}"
VERSION="${VERSION:-latest}"

# ── Detect platform ────────────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
case "$OS" in
  darwin|linux) ;;
  *) echo "✗ Unsupported OS: $OS (drdeploy supports macOS and Linux)"; exit 1 ;;
esac

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64|amd64) ARCH="x64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  *) echo "✗ Unsupported architecture: $ARCH (drdeploy supports x64 and arm64)"; exit 1 ;;
esac

FILENAME="drdeploy-${OS}-${ARCH}"

# ── Resolve download URL ───────────────────────────────────────────────────
if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/${FILENAME}"
else
  URL="https://github.com/${REPO}/releases/download/${VERSION}/${FILENAME}"
fi

# ── Download ───────────────────────────────────────────────────────────────
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

echo "→ Downloading drdeploy (${OS}/${ARCH})..."
if ! curl -fsSL "$URL" -o "$TMP"; then
  echo "✗ Download failed."
  echo "  URL: $URL"
  echo "  Check https://github.com/${REPO}/releases for the right version."
  exit 1
fi
chmod +x "$TMP"

# ── Install ────────────────────────────────────────────────────────────────
DEST="${PREFIX}/drdeploy"
mkdir -p "$PREFIX" 2>/dev/null || true

if [ -w "$PREFIX" ]; then
  mv "$TMP" "$DEST"
else
  echo "→ $PREFIX is not writable. Using sudo..."
  sudo mv "$TMP" "$DEST"
fi

# ── Verify ─────────────────────────────────────────────────────────────────
if ! command -v drdeploy >/dev/null 2>&1; then
  echo "⚠ Installed at $DEST but $PREFIX is not in your \$PATH."
  echo "  Add it: export PATH=\"$PREFIX:\$PATH\""
  echo "  Or run directly: $DEST"
  exit 0
fi

echo ""
echo "✓ $(drdeploy --version) installed"
echo ""
echo "Get started:"
echo "  drdeploy login"
echo "  drdeploy add example.com"
echo "  drdeploy scan example.com"
