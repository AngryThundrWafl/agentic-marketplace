# Migration Plan, Decision Rules, and References

> **Parent contract:** [architecture.md](architecture.md) (boundaries and invariants win on conflict).

---

## 1. Dependency-ordered migration plan

- **Phase 0:** Repo scaffold, workspaces, pinned 1.0.0 schemas, `meta.json` + compatibility schemas, CI release gate on empty/bad plugin fixtures.
- **Phase 1:** Portable Agent Plugins + skills (`agent-plugin/`), verified by behavioral install/activation test on at least one conformant client (e.g. GitHub Copilot CLI or Codex CLI).
- **Phase 2:** MCP validation (`mcp.json`, reserved env-key checks, HTTPS/loopback checks), secrets scan, resolved path containment, and per-component failure isolation.
- **Phase 3:** `capabilities/` registry + evidence files + typed `NormalizedPlugin` model + `meta.json`.
- **Phase 4:** Translation `plan()` + `compatibility.json` / `COMPATIBILITY.md` generator (tested on fixtures before writing target emitters).
- **Phase 5:** **First adapter end-to-end** (`build/adapters/copilot/` or `build/adapters/claude-code/`, chosen via ADR) with behavioral runtime tests.
- **Phase 6:** Remaining adapters sequentially, one verified before the next begins.
- **Phase 7:** Canonical `agents/`, `commands/`, and `rules/` with per-adapter `permissions.md` matrices.
- **Phase 8:** Canonical `hooks/` and native `overrides/<target>/` in isolated sandbox tests.
- **Phase 9:** Marketplace catalog generators, SBOM/provenance/signing automation.
- **Phase 10:** Documentation parity audit and legacy layout archival.

---

## 2. Non-goals & architectural decision rules

**Non-goals:** Identical cross-harness runtime behavior; inventing a portable lifecycle-hook spec on top of 1.0.0; translating arbitrary TypeScript extensions across runtimes; weakening security policies for compatibility; attributing signing/sandboxing/permissions to the Agent Plugins 1.0.0 spec itself.

**Decision rules:**
1. Prefer published standards (`Agent Plugins 1.0.0`, `Agent Skills`, `MCP`) over custom formats.
2. Keep target-specific semantics out of `agent-plugin/` except inside documented reverse-domain namespaces.
3. Keep reusable target translation code in `build/adapters/<target>/`, never duplicated per plugin.
4. Make all translation loss and variable rewrites observable by name in `compatibility.json`.
5. Fail closed on security-sensitive translation and permission-matrix collisions.
6. Test actual runtime installation and execution; packaging is not proof.
7. Pin dependencies and verify byte reproducibility via content-hash manifests.
8. Model product surfaces (`vendor.product.surface`), not vendor umbrellas.
9. Never ship a capability claim without a versioned, non-stale file in `capabilities/evidence/`.
10. When the model and upstream reality disagree, update the model and evidence in the same commit.

---

## 3. Primary references

Normative:
- Agent Plugins Specification 1.0.0 — https://agent-plugins.org/specification
- Agent Plugins 1.0.0 JSON Schemas — https://agent-plugins.org/schemas
- Agent Plugins Spec Repository — https://github.com/agentplugins/agent-plugins-spec
- Agent Skills Specification — https://agentskills.io/specification

Harness documentation (starting points for `capabilities/evidence/`, not evidence on their own):
- Claude Code Plugins — https://code.claude.com/docs/en/plugins
- OpenAI Plugins (Codex & ChatGPT Plugins Directory) — https://developers.openai.com/plugins/build/plugins
- Cursor Plugins Reference — https://cursor.com/docs/reference/plugins
- GitHub Copilot Plugins & Marketplace Reference — https://docs.github.com/en/copilot/reference/plugin-and-marketplace-reference
- VS Code Agent Plugin Authoring Reference — https://code.visualstudio.com/docs/agents/reference/agent-plugin-reference
- Google Antigravity Marketplace & Plugins — https://antigravity.google/docs/marketplace/
- OpenCode Plugins / Skills / MCP — https://opencode.ai/docs/plugins/ , https://opencode.ai/docs/skills/ , https://opencode.ai/docs/mcp-servers/
- Pi Packages (`@earendil-works/pi-coding-agent`) — https://docs.pi.dev/latest/packages

Precedents (patterns only — verify layouts against [portable-contract.md](portable-contract.md#2-the-portable-root--allowed-top-level-entries-only)):
- `microsoft/win-dev-skills` (PR #159 — two-roots separation with `agent-plugin/`) — https://github.com/microsoft/win-dev-skills/pull/159
- `wshobson/agents` — https://github.com/wshobson/agents
- `repobuddy/buddy-agent-harness` — https://github.com/repobuddy/buddy-agent-harness
- `FortiumPartners/ai-mesh-plugins` — https://github.com/FortiumPartners/ai-mesh-plugins

---

## Appendix A — Second adversarial review log

- **R1 — Corrected OpenAI / Codex / ChatGPT status:** Replaced the erroneous claim that `developers.openai.com/plugins/build/plugins` was superseded by the 2024 retirement of 2023 ChatGPT plugins; documented the active 2026 unified ChatGPT + Codex Plugins Directory and `extensions["com.openai"]`.
- **R2 — Added verified Cursor dual-format behavior & `${PLUGIN_ROOT}` caveat:** Documented both portable `plugin.json` mode (where Cursor does not expand `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` in `mcp.json`) and native `.cursor-plugin/plugin.json` mode (`${CURSOR_PLUGIN_ROOT}`).
- **R3 — Updated Antigravity & Pi standings:** Documented Antigravity's live plugin/marketplace surface (`agy plugin`, `antigravity://`) and corrected Pi's target ID to `earendil.pi.package` (`@earendil-works/pi-coding-agent`, `package.json` `"pi"` key + `"pi-package"` keyword).
- **R4 — Eliminated adapter-location contradiction:** Separated reusable target translators (`build/adapters/<target>/`) from per-plugin native overrides (`plugins/<plugin-name>/overrides/<target>/`) so adapter logic is not duplicated across plugins.
- **R5 — Tightened Agent Plugins 1.0.0 spec alignment:** Distinguished build-time strictness from spec client tolerance (§5.2/§8.1/§11.1), added the spec §7.2.2 prohibition against `PLUGIN_ROOT`/`PLUGIN_DATA` keys inside `mcp.json` `env`, and clarified intra-root vs cross-root symlink rules (§4.1).
- **R6 — Added `packageFormat` disambiguation in `meta.json`:** Prevents dual-format targets (e.g. Cursor, Codex) from mixing portable and native layouts inside the same `dist/<plugin>/<target>/` directory.

## Appendix B — Pre-Phase 1 decisions (resolved 2026-11-25)

1. **SBOM + signing baseline:** **CycloneDX 1.6 JSON** + **Sigstore Cosign keyless OIDC** (detached `.sig` / `.bundle` artifacts alongside SHA-256 manifests; documented in [releases.md](releases.md)).
2. **Phase 5 first adapter:** **`github.copilot.cli`** selected as the first end-to-end adapter, followed by `anthropic.claude-code.cli`.
3. **Sandbox profile:** Rootless OCI container (`node:22-bookworm-slim`, `--network=none` by default, `--read-only` + `tmpfs` `/tmp`, `--cpus=1`, `--memory=1g`, `60s` timeout; documented in [testing.md](testing.md)).
4. **Antigravity & Codex extension schemas:** Reference/vendor `antigravity/v1/plugin.json` and OpenAI `developers.openai.com/plugins/build/plugins` docs in `capabilities/evidence/` during Phase 3, keeping runtime-support statuses `unknown` until evidenced by a tested runtime version.
5. **Migration scope:** Migrate `dockhand-gitops` and `prompt-engineering` from `agent-plugin-marketplace`; sample/educational packages in the three source repos are out of scope.
