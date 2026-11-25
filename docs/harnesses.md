# Harness Capability & Adapter Architecture

> **Parent contract:** [architecture.md](architecture.md) (boundaries and invariants win on conflict).

---

## 1. Product surfaces are first-class targets

Do not model support as `Claude | Codex | Copilot | Cursor | OpenCode | Pi`. Model the actual integration surface, with a stable target id using `<vendor>.<product>.<surface>`:

- `anthropic.claude-code.cli`, `anthropic.claude-code.vscode`, `anthropic.claude.cowork`
- `openai.codex.cli`, `openai.codex.app`
- `openai.chatgpt.plugins-directory` (unified ChatGPT + Codex directory surface)
- `github.copilot.cli`, `github.copilot.cloud-agent`, `github.copilot.app`, `github.copilot.vscode`
- `anysphere.cursor.ide`, `anysphere.cursor.cli`
- `microsoft.vscode.agent-plugins` (VS Code core Agent Plugins client, distinct from Copilot in VS Code)
- `google.antigravity.app`, `google.antigravity.cli`
- `opencode.opencode.cli`
- `earendil.pi.package` (Pi coding agent package surface, `@earendil-works/pi-coding-agent`)

A vendor can have multiple runtimes with different loading and execution semantics. Adding a target means adding a row to `capabilities/harnesses.yaml` **plus** evidence. A row without evidence is `unknown`.

---

## 2. Capability dimensions & evidence

Each target records support independently for:

- Agent Plugins 1.0 (package loading + `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` variable expansion)
- Native plugin format (manifest path, schema, component discovery rules)
- Agent Skills (discovery paths, frontmatter fields, `allowed-tools` enforcement)
- MCP transports (`stdio`, `streamable-http`, `sse`, auth/OAuth, env expansion)
- Agent definitions
- Commands and prompts
- Rules and instructions
- Lifecycle hooks (event names, execution mechanism, blocking vs async)
- Permission controls (exact permission model, allowlists/denylists, approval prompts)
- Subagent delegation
- Package installation (mechanism, scope: user/project/local, update behaviour)
- Marketplace distribution (catalog schema, review gates, immutable ref support)
- Native TypeScript / executable extensions
- Authentication and secret handling
- Runtime dependency management

For each dimension, record the *mechanism* (file, field, command, API), not just a boolean.

Each capability entry in `capabilities/evidence/` MUST include:
- target id, feature id, support status;
- documentation URL;
- last verified date;
- tested runtime version (exact version string, never “latest”);
- test reference (a test id in `tests/`, where available);
- known limitations and runtime quirks (e.g. Cursor not expanding `${PLUGIN_ROOT}` in `mcp.json`).

Use exactly these 7 statuses everywhere:

| Status | Meaning |
|---|---|
| `native` | Officially supported by the target, in its own format |
| `standard` | Supported through a published interoperability standard (Agent Plugins 1.0.0 / Agent Skills / MCP) |
| `adapter` | Implemented through a tested translation in this repo |
| `preview` | Officially available but subject to change |
| `experimental` | Community or unverified implementation |
| `unsupported` | Known not to be supported — with a source |
| `unknown` | Not yet established |

Never turn `unknown` into a supported capability based on assumptions, analogy to another surface, or successful packaging. An entry older than 90 days without re-verification MUST be flagged `stale` in CI (the status stays as recorded; the *freshness* is what is stale).

---

## 3. Initial target strategy — strategy, not support

| Target | Initial distribution strategy | Standing, 2026-11-25 (verify in `capabilities/evidence/`) |
|---|---|---|
| **Claude Code** (`anthropic.claude-code.cli`) | Native Claude plugin packaging (`.claude-plugin/plugin.json` + root `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json` + `.claude-plugin/marketplace.json`). Portable skills reused from `agent-plugin/skills/`. | **Not an Agent Plugins 1.0 package-format client** — Claude Code uses `.claude-plugin/plugin.json` and root component directories, while supporting the Agent Skills `SKILL.md` format. Do not describe Claude Code as “Agent Plugins core”. |
| **Codex & ChatGPT** (`openai.codex.cli`, `openai.chatgpt.plugins-directory`) | Agent Plugins 1.0 core (`plugin.json`, `skills/`, `mcp.json`) + `extensions["com.openai"]` in `plugin.json`, plus `.agents/plugins/` / `.codex-plugin/` where required by surface. | **Active OpenAI Plugins platform** (`developers.openai.com/plugins/build/plugins`). Legacy 2023 `.well-known/ai-plugin.json` was retired in 2024; the current 2026 system is the unified ChatGPT + Codex Plugins Directory supporting Skills + MCP. |
| **Cursor** (`anysphere.cursor.ide`) | Dual-mode: portable Agent Plugins (`plugin.json`) for skills+MCP-only plugins (accounting for `${PLUGIN_ROOT}` limitation), OR native Cursor Plugin (`.cursor-plugin/plugin.json` + root `skills/`, `agents/`, `commands/`, `rules/`, `hooks/`, `mcp.json`). | **Dual-format client** (`cursor.com/docs/reference/plugins`). Cursor loads conformant Agent Plugins natively (except `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` expansion in `mcp.json`) and supports `.cursor-plugin/plugin.json` + `.cursor-plugin/marketplace.json`. |
| **GitHub Copilot** (`github.copilot.*`) | Agent Plugins 1.0 core + `com.github.copilot/` extension directory and `extensions["com.github.copilot"]`. Legacy Copilot format treated as a separate deprecated target. | Agent Plugins launch client (`com.github.copilot` documented). Surfaces (`cli`, `vscode`, `cloud-agent`, `app`) MUST be tracked separately as capabilities differ across them. |
| **VS Code** (`microsoft.vscode.agent-plugins`) | Agent Plugins 1.0 core + documented VS Code extension namespace if needed. | Agent Plugins launch client (`code.visualstudio.com/docs/agents/reference/agent-plugin-reference`). Distinct from Copilot-specific surfaces. |
| **Antigravity** (`google.antigravity.app`, `google.antigravity.cli`) | Native Antigravity plugin packaging (`plugin.json` + skills, MCP servers, rules, subagents, lifecycle hooks; `agy plugin install` / `/plugin` / `antigravity://` deep links). | **Active plugin & marketplace platform** (`antigravity.google/docs/marketplace/`). File exact `plugin.json` schema and Agent Plugins 1.0 interoperability details in `capabilities/evidence/` before emitting. |
| **OpenCode** (`opencode.opencode.cli`) | Native skill discovery (`.opencode/skills/` or `.agents/skills/`), native `opencode.json` MCP config, and optional TypeScript plugins (`.opencode/plugins/`) only when runtime code is needed. | Not an Agent Plugins 1.0 package client. TypeScript plugins are code modules, not skill bundles. |
| **Pi** (`earendil.pi.package`) | Pi npm/git package (`package.json` with `"pi"` resource config and `"pi-package"` keyword; conventional `skills/`, `prompts/`, `themes/`, `extensions/`). | Not an Agent Plugins 1.0 package client. Pi packages do not define a portable MCP component — MCP requires a separate Pi extension or user config. |

---

## 4. Adapter design

Adapters live in `build/adapters/<target>/` and are independent target implementations. They MUST NOT contain hidden authoring logic or modify canonical source. An adapter that edits `plugins/<plugin-name>/` is broken by definition.

### 4.1 Adapter responsibilities

Each adapter implements:
1. Capability discovery (read from `capabilities/`, not hard-coded claims).
2. Component compatibility checks (per component, per target, per `packageFormat`).
3. Frontmatter transformation (with a tested mapping table, not ad-hoc string replacement).
4. Native manifest and directory layout generation.
5. Tool, variable (`${PLUGIN_ROOT}`), and model alias mapping (with explicit tables; an unmapped tool or unsupported variable is an error or declared `partial`/`unsafe`, never a silent drop).
6. Dependency resolution.
7. Permission translation — via an explicit, tested permission matrix (`build/adapters/<target>/permissions.md`).
8. Integration of per-plugin overrides from `plugins/<plugin-name>/overrides/<target>/` (with containment and schema validation).
9. Output packaging and verification (structural + named behavioral test reference).

### 4.2 Adapter interface

```typescript
interface HarnessAdapter {
  readonly id: string;              // target id
  readonly version: string;         // adapter SemVer; a translation-behaviour change MUST bump it
  readonly capabilityRegistryVersion: string;

  capabilities(): CapabilitySet;

  plan(
    plugin: NormalizedPlugin,
    target: HarnessTargetConfig
  ): TranslationPlan;      // per-component: exact | equivalent | partial | unsupported | unsafe,
                           //   with omitted features named and tests named for `equivalent`

  emit(
    plan: TranslationPlan,
    output: OutputDirectory
  ): Promise<EmissionResult>; // MUST be idempotent for the same plan + inputs; MUST NOT write outside `output`

  verify(
    output: OutputDirectory
  ): Promise<VerificationResult>;

  dryRun(
    plan: TranslationPlan
  ): Promise<TranslationPlan>; // planning without writing, for CI diffing
}
```

Adapters MUST be independently testable, with golden tests per harness version. Shared translation logic belongs in `build/translate/` only when semantics are genuinely shared — evidenced by two adapters using it for the same semantics. A branch that names a vendor inside shared code is a smell; move it into `build/adapters/<target>/`.

### 4.3 Native adapters vs. generated compatibility files

**Decision tree (apply in order):**
1. Portable as-is (`agent-plugin/` emitted directly)
2. Namespaced client extension (`agent-plugin/<reverse-domain>/` + `extensions["<reverse-domain>"]`)
3. Generated native equivalent from `canonical/` (tested in `build/adapters/<target>/`)
4. Per-plugin hand-written native override (`plugins/<plugin-name>/overrides/<target>/`)
5. Do not ship for that target (report `unsupported` in `meta.json` and loss report)

Never skip to a later step because it is faster. Do not write a TypeScript extension solely to repackage a standard skill.

### 4.4 Per-harness adapter notes

- **OpenCode (`opencode.opencode.cli`):** Emit native skills, agents, commands, and `opencode.json` MCP definitions. Reserve TypeScript plugins (`.opencode/plugins/`) for actual runtime code, custom tools, or event hooks.
- **Pi (`earendil.pi.package`):** Emit a valid npm/git Pi package with `package.json` (`"keywords": ["pi-package"]` and `"pi"` resource paths for `extensions`, `skills`, `prompts`, `themes`). Declare any required `@earendil-works/*` peer dependencies (provided by Pi at runtime) vs bundled dependencies (`node_modules` resource paths, since Pi loads installed packages with isolated module roots). Do not assume `mcp.json` works natively; treat MCP in Pi as requiring a verified MCP extension dependency.
- **Codex & ChatGPT (`openai.*`):** Use root `agent-plugin/plugin.json` with `extensions["com.openai"]` where portable Agent Plugins format is supported, or emit `.codex-plugin/` / ZIP submission bundles (with automated metadata checks and test-case artifacts) for surfaces requiring them.
- **Copilot (`github.copilot.*`):** Emit root Agent Plugins layout with `com.github.copilot/` (e.g. `com.github.copilot/agents/`, `com.github.copilot/hooks/hooks.json`, `com.github.copilot/extensions/`) and `extensions["com.github.copilot"]`. Keep legacy un-namespaced Copilot manifests completely isolated from Agent Plugins packages.
- **Claude Code (`anthropic.claude-code.cli`):** Emit `.claude-plugin/plugin.json` (manifest only — `name` required, `version` / `description` / `author` / `userConfig` optional) and place `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `output-styles/`, and monitors at the **emitted plugin root** (never inside `.claude-plugin/`, where Claude Code ignores components). Flag in `COMPATIBILITY.md` that Claude Code plugin hooks and MCP servers execute outside the sandbox.
- **Cursor (`anysphere.cursor.ide`):** For `packageFormat: "agent-plugins-1.0"`, emit `agent-plugin/` verbatim **only** if `mcp.json` does not rely on `${PLUGIN_ROOT}` or `${PLUGIN_DATA}` (since Cursor does not expand those variables in `mcp.json`). For `packageFormat: "cursor-native"`, emit `.cursor-plugin/plugin.json` at `.cursor-plugin/` and `skills/`, `agents/`, `commands/`, `rules/`, `hooks/`, and root `mcp.json` (rewriting `${PLUGIN_ROOT}` → `${CURSOR_PLUGIN_ROOT}` and recording the rewrite in the loss report).
- **Antigravity (`google.antigravity.*`):** Emit native Antigravity plugin layout (`plugin.json` + skills, MCP, rules, subagents, hooks) only after the exact manifest schema is pinned in `capabilities/evidence/`.
