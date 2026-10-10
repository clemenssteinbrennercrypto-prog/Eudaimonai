#!/usr/bin/env bash
# The macOS app's Rust access client against the LOCAL Supabase stack
# (companion/src-tauri/src/access/live_tests.rs). Resets the local database.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
STATUS="$(cd "$ROOT" && supabase status -o env)"
case "$STATUS" in
  *'API_URL="http://127.0.0.1:54321"'*) ;;
  *) echo "Local Supabase stack is not running on 127.0.0.1:54321" >&2; exit 2 ;;
esac
(cd "$ROOT" && supabase db reset >/dev/null 2>&1)
CARGO="${CARGO:-$(command -v cargo || echo "$HOME/.cargo/bin/cargo")}"
(cd "$ROOT/companion/src-tauri" && "$CARGO" test live_ -- --ignored --test-threads=1)
(cd "$ROOT" && supabase db reset >/dev/null 2>&1)
