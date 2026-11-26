# Repository Agent Instructions

Work directly in the repository using tools, read files before editing or describing them, and batch independent read or search calls in parallel.

## Commands

Run verification from the repository root with `corepack pnpm`:

- **Full gate (run before reporting code, schema, or plugin changes done):** `corepack pnpm release-gate` — runs `typecheck`, `test`, `validate:plugins`, and `build` in sequence so generated `marketplaces/` stays in sync.
- **Typecheck:** `corepack pnpm typecheck` (`tsc --noEmit`).
- **Full test suite:** `corepack pnpm test` (`vitest run`, 10 files) — invokes globally installed `copilot`, `opencode`, and `pi` CLIs from `PATH` for behavioral tests.
- **Single test file:** `corepack pnpm test tests/<file>.test.ts` (omit `--`, because passing `--` makes Vitest run all 10 files instead of filtering).
- **Plugin validation:** `corepack pnpm validate:plugins` — checks fixtures and `plugins/*` schemas, MCP rules, secrets, and symlink containment.
- **Build & catalog generation:** `corepack pnpm build` — emits gitignored `dist/<plugin>/<target>/` artifacts and regenerates committed `marketplaces/.claude-plugin/marketplace.json` and `marketplaces/catalog.json`.
- **Antigravity manifest validation:** `agy plugin validate ./plugins/<plugin>/agent-plugin` (or `./plugins/<plugin>/overrides/google.antigravity.app`, rather than the authoring root `./plugins/<plugin>`).
- **Local Pi & OpenCode package testing (from `dist/`):** After `corepack pnpm build`, test built packages locally without publishing to npm or hardcoding secrets:
  - **Pi:** Create an isolated `PI_CODING_AGENT_DIR=/tmp/pi-test`, copy `~/.pi/agent/{models.json,models-store.json,auth.json}`, symlink `~/.pi/agent/extensions`, and copy `~/.pi/agent/settings.json` with `"packages": []` so only the local `dist/` build is loaded. Run `PI_CODING_AGENT_DIR=/tmp/pi-test pi install ./dist/dockhand-gitops/earendil.pi.package` (and `prompt-engineering`). Verify offline extension loading with `DOCKHAND_MCP_URL="https://example.invalid/mcp" DOCKHAND_MCP_AUTH_TOKEN="test-token" PI_CODING_AGENT_DIR=/tmp/pi-test pi -p --no-session --no-mcp --mode json "Reply OK"`, or test live MCP tool calls with `DOCKHAND_MCP_URL` + `DOCKHAND_MCP_AUTH_TOKEN` set and `--model omlx/Inkling-2-Mini-oQ4e-mtp`.
  - **OpenCode v2:** `opencode --standalone mcp list` and `GET /api/mcp` do not eagerly connect to remote MCP servers. To verify plugin loading and live MCP tool calls, use an isolated `XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_DATA_HOME` whose `opencode.jsonc` points `"plugins"` at `file://<repo>/dist/<plugin>/opencode.opencode.cli` (and declares `provider.omlx` + `Inkling-2-Mini-oQ4e-mtp` using `{env:OMLX_API_KEY}` and `$OMLX_URL` if local v1 plugins like `omlx.js` are not loaded), then run `opencode --standalone --print-logs --log-level warn plugin list` (confirming no `PluginModule.LoadError`) and `opencode --standalone run --auto -m omlx/Inkling-2-Mini-oQ4e-mtp "..."` from `./dist/dockhand-gitops/opencode.opencode.cli`.
- **Search note:** `rg` is not installed in this environment, so use `grep -rn` or `find` for repository searches.

## Architecture Map

This monorepo separates authoring source, portable Agent Plugins 1.0.0 packages, emitted target outputs, and reusable adapters. Link-read only the contract doc needed for your active task:

- `plugins/<name>/agent-plugin/` — portable Agent Plugins 1.0.0 package root (`plugin.json`, `skills/<skill>/SKILL.md`, optional `mcp.json`, reverse-domain dirs). Contract: [docs/portable-contract.md](docs/portable-contract.md).
- `plugins/<name>/canonical/` & `overrides/<target>/` — non-portable source and per-plugin native overrides declared in `plugins/<name>/meta.json`. Contract: [docs/canonical-and-build.md](docs/canonical-and-build.md).
- `build/adapters/<target>/` — reusable target translators and 4-column `permissions.md` matrices (`Canonical Permission | Privilege Level | Native Mapping | Enforcement Notes`). Contract: [docs/harnesses.md](docs/harnesses.md).
- `capabilities/` — `harnesses.yaml`, `features.yaml`, and `evidence/*.json`. Contract: [docs/harnesses.md](docs/harnesses.md).
- `schemas/` — pinned Agent Plugins 1.0.0 schemas (`plugin.schema.json`, `mcp.schema.json`) and `schemas/internal/`.
- `tests/` — Vitest suites (`*.test.ts`), `fixtures/`, and `sandbox/`. Contract: [docs/testing.md](docs/testing.md).
- Full boundaries & invariants: [docs/architecture.md](docs/architecture.md), [docs/security.md](docs/security.md), [docs/releases.md](docs/releases.md).

## Conventions and Gotchas

- **90-day capability evidence window:** `build/capabilities/registry.ts` treats `lastVerifiedDate` older than 90 days (or unparseable) as stale. `build/cli.ts` uses wall-clock `new Date()`, whereas tests pass a pinned `referenceNow` (such as `new Date("2026-11-25T12:00:00Z")`) so unit tests remain deterministic.
- **MCP validation rules:** `mcp.json` rejects `PLUGIN_ROOT` and `PLUGIN_DATA` keys in `env`, requires HTTPS for non-loopback HTTP endpoints, and rejects case-insensitive duplicate headers (`build/validate-mcp.ts`).
- **Synchronized plugin version bumps:** When modifying content in a shipped plugin skill, bump `version` consistently across `plugin.json`, `.antigravity-plugin/plugin.json` (if present), `SKILL.md` `metadata.version`, `CHANGELOG.md`, `README.md`, regenerated `marketplaces/` (via `corepack pnpm build`), and version assertions in `tests/`.
- **Minimal scoped edits:** Change only what the task requests so unrelated code, comments, and `docs/` contracts remain intact.

## Ask Before

Request explicit user confirmation before any destructive, hard-to-reverse, or externally visible action:

- Force-pushing, resetting published git history, deleting branches, or bypassing git hooks.
- Updating `lastVerifiedDate` in `capabilities/evidence/*.json` without running the target runtime verification.
- Editing pinned upstream schemas (`schemas/plugin.schema.json`, `schemas/mcp.schema.json`).
- Invoking live `dockhand-gitops` container lifecycle tools (`start_container`, `stop_container`, `restart_container`, `pause_container`, `unpause_container`) or probing external homelab endpoints.

## Final Checklist

1. Keep edits inside the requested scope and follow the three-roots separation.
2. Verify single tests with `corepack pnpm test tests/<file>.test.ts` (no `--`).
3. Pass `corepack pnpm release-gate` before reporting code, schema, or plugin changes done.
