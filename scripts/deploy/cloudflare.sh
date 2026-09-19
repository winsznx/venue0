#!/usr/bin/env bash
# Builds and deploys apps/web to Cloudflare Workers from a clean copy of the repo that contains no .env or keys/,
# because OpenNext inlines .env files it finds into the Worker. Blocks the deploy if the output contains any .env value.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$ROOT"
git ls-files -co --exclude-standard -z | xargs -0 tar -cf - | tar -xf - -C "$WORK"
test ! -e "$WORK/.env" && test ! -e "$WORK/keys" && test ! -e "$WORK/apps/web/.dev.vars"
cd "$WORK"
pnpm install --frozen-lockfile --filter "@venue0/web..." >/dev/null
cd apps/web
pnpm exec opennextjs-cloudflare build
node --experimental-strip-types "$ROOT/scripts/deploy/secret-scan.ts" .open-next "$ROOT/.env"
if [ "${1:-}" = "--deploy" ]; then CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://postgres@localhost:5432/unused-local-emulator" pnpm exec opennextjs-cloudflare deploy; else echo "built and scanned; pass --deploy to publish"; fi
