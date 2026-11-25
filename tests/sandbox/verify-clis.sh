#!/usr/bin/env bash
set -euo pipefail

ISOLATED_HOME="$(mktemp -d)"
trap 'rm -rf "$ISOLATED_HOME"' EXIT
export HOME="$ISOLATED_HOME"
export XDG_CACHE_HOME="$ISOLATED_HOME/.cache"
mkdir -p "$XDG_CACHE_HOME"

echo "=== CLI Versions ==="
copilot --version
claude --version
codex --version
opencode --version
pi --version
if command -v agy >/dev/null 2>&1; then
  echo "agy $(agy --version)"
else
  echo "agy: not mounted"
fi

echo ""
echo "=== 1. GitHub Copilot CLI (dist/<plugin>/github.copilot.cli) ==="
copilot plugin install /workspace/dist/dockhand-gitops/github.copilot.cli
copilot plugin install /workspace/dist/prompt-engineering/github.copilot.cli
copilot plugin list

echo ""
echo "=== 2. Claude Code CLI (dist/<plugin>/anthropic.claude-code.cli) ==="
claude plugin validate /workspace/dist/dockhand-gitops/anthropic.claude-code.cli
claude plugin validate /workspace/dist/prompt-engineering/anthropic.claude-code.cli
echo "Claude Code plugin validation PASSED."

if command -v agy >/dev/null 2>&1; then
  echo ""
  echo "=== 3. Antigravity CLI (dist/<plugin>/google.antigravity.app) ==="
  agy plugin validate /workspace/dist/dockhand-gitops/google.antigravity.app
  agy plugin validate /workspace/dist/prompt-engineering/google.antigravity.app
fi

echo ""
echo "All available CLI checks PASSED."
