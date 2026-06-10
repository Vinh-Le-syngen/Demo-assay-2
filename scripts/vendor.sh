#!/usr/bin/env bash
# Test-gated vendor: build a @sys/<pkg> tarball ONLY if its checks pass, then copy it into a
# consumer's vendor/ dir. The point: a vendored tarball is "tested by construction", so the consumer
# (Qarar, mongu, …) never re-creates @sys tests — it trusts the gate and tests only its own
# integration. This is the tarball-bridge equivalent of `pnpm release` gating publish on `pnpm check`.
#
# Usage: scripts/vendor.sh <pkg> <consumer-vendor-dir>
#   e.g. scripts/vendor.sh consent ~/projects/qarar/vendor
set -euo pipefail

pkg="${1:?usage: vendor.sh <pkg> <consumer-vendor-dir>}"
dest="${2:?usage: vendor.sh <pkg> <consumer-vendor-dir>}"
cd "$(dirname "$0")/.."

echo "▸ gate: typecheck @sys/$pkg"
pnpm --filter "@sys/$pkg" typecheck
echo "▸ gate: test @sys/$pkg"
pnpm --filter "@sys/$pkg" test
echo "▸ build @sys/$pkg"
pnpm --filter "@sys/$pkg" build

cd "packages/$pkg"
tgz="$(npm pack 2>/dev/null | tail -1)"
mkdir -p "$dest"
cp "$tgz" "$dest/"
rm -f "$tgz"
echo "✓ vendored $tgz → $dest/  (checks passed — tested by construction)"
