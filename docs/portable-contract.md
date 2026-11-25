# Portable Package Contract

> **Parent contract:** [architecture.md](architecture.md) (boundaries and invariants win on conflict).

---

## 1. Agent Plugins 1.0.0 — what the spec is

The portable package contract is defined by the published specification and schemas at `https://agent-plugins.org/specification`. **Spec version 1.0.0 is the current published release (published 2026-08-06).**

- The root manifest is `plugin.json` at the package root. Its `$schema` MUST be `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`.
- Portable skills are discovered under `skills/<skill-name>/SKILL.md` — one level deep, immediate children only.
- Portable MCP configuration is at `mcp.json` at the package root. Its `$schema` MUST be `https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`.
- Do not invent additional portable component locations or manifest fields. Do not relocate `skills/` or `mcp.json` via the manifest — the spec fixes their locations.

**Version guard:** Agent Plugins `1.1.0` exists upstream as a **working draft** (adding portable `tool.before` subprocess hooks and draft schemas). It is **not** 1.0.0. Do not treat working-draft text, draft schemas, or draft hook behaviour as requirements of 1.0.0, and do not ship a package claiming 1.0.0 that relies on 1.1.0 features. Upgrading the spec version is a deliberate, tested migration, never a schema-string edit.

Machine-readable schemas in `schemas/` (`plugin.schema.json` and `mcp.schema.json`) MUST be pinned copies of the published 1.0.0 files. If the spec text and a schema disagree, the spec text is authoritative (per the Agent Plugins schema documentation) — record the discrepancy in `capabilities/evidence/` and do not silently edit the vendored schema.

---

## 2. The portable root — allowed top-level entries only

Inside `agent-plugin/`, the only permitted top-level entries are:

- `plugin.json`
- `skills/`
- `mcp.json`
- one directory per registered reverse-domain client namespace, e.g. `com.github.copilot/`

**Authoring strictness vs. spec client tolerance:** Under Agent Plugins 1.0.0 (§5.2, §8.1, §11.1), conformant *clients* MUST ignore unknown top-level directories and report-and-ignore unknown top-level `plugin.json` fields without failing the plugin. However, **this repository enforces strict authoring hygiene**: the build MUST reject any portable root containing an unregistered top-level entry or unknown manifest key rather than relying on client leniency.

Client-extension directories MUST be registered in `capabilities/harnesses.yaml` with the owning client, the doc URL that defines them, and the date verified. An invented namespace is not a namespace.

Every top-level entry in `agent-plugin/` MUST be either spec-defined or a registered reverse-domain namespace. Native override code MUST remain isolated from portable components. Do not introduce an override directory merely to duplicate an otherwise portable skill.

---

## 3. Manifest ownership (`plugin.json`)

The Agent Plugins 1.0.0 manifest has a closed schema (`additionalProperties: false`) with ten permitted top-level properties:

`$schema`, `name`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `extensions`.

Only `$schema` and `name` are REQUIRED. `name` MUST be 1–64 characters, lowercase letters / digits / `-` / `.`, start and end alphanumeric, with no consecutive `--` or `..` (and no Windows reserved device names).

The root manifest MUST NOT contain arbitrary internal fields such as `agents`, `commands`, `hooks`, `supportedHarnesses`, `capabilities`, `build`, or `adapterConfig`. Unknown top-level fields are a build validation error.

Internal metadata belongs in `meta.json` at the authoring root, validated against `schemas/internal/meta.schema.json`.

Client-specific manifest data belongs under the appropriate reverse-domain key inside `extensions` (only for documented namespaces — e.g. `com.github.copilot` or `com.openai`):

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "example-plugin",
  "extensions": {
    "com.github.copilot": {
      "agents": { "paths": ["agents"] }
    }
  }
}
```

Client-specific files belong in the corresponding top-level reverse-domain directory (`com.github.copilot/`), not in a shared `agents/` directory at the portable root.

---

## 4. Version discipline

- The plugin manifest declares the Agent Plugins specification version via `$schema`. That is a **spec-version selector**, not the plugin’s release version.
- `version` in `plugin.json` is the plugin version string. SemVer is RECOMMENDED by the spec, not required for spec validity — **this repo REQUIRES SemVer** for every published plugin, because marketplaces and caches key on it.
- When `mcp.json` is present, its `$schema` spec version MUST match `plugin.json`’s spec version. **Spec failure mode:** under Agent Plugins 1.0.0, an `mcp.json` validation or version failure disables MCP for that plugin without invalidating its independent skills. The build MUST model that per-component isolation and surface it in the loss report.
- Schema upgrades MUST be explicit, validated, and compatibility-tested. Never automatically rewrite a published package to target a newer specification.

---

## 5. Portable skills

Skills MUST conform to the Agent Skills specification (`https://agentskills.io/specification`).

Requirements (enforced by build validation):

- A valid `SKILL.md` with YAML frontmatter + Markdown body.
- Required `name` and `description` metadata; `name` MUST match the parent directory name.
- `description` 1–1024 chars; `name` 1–64 chars, lowercase alphanumeric + single hyphens.
- Optional `license`, `compatibility` (`≤ 500` chars), `metadata` (string-to-string map), and `allowed-tools` (experimental space-delimited string).
- Supporting files are referenced intentionally, one level deep from `SKILL.md` where possible; `scripts/`, `references/`, and `assets/` are *conventions*, not spec-required directories — do not require them in a skill that does not need them.
- Scripts MUST declare runtime, interpreter, and dependencies in `SKILL.md` (or `compatibility` / `meta.json`); a script with an undeclared runtime is a build validation failure.
- References are loaded on demand (progressive disclosure).

Do not impose a monorepo-wide unique skill directory name requirement. Skill identity and collision handling are validated **within the relevant package and target namespace**. A collision is a build error for that target, with both colliding skills named.

---

## 6. MCP servers (`mcp.json`)

MCP configuration (`mcp.json`) MUST conform to the Agent Plugins 1.0.0 MCP schema (`https://agent-plugins.org/schemas/1.0.0/mcp.schema.json`). It is executable integration configuration, not static metadata.

The build MUST validate, per server entry independently:

- `type` is explicit — one of `stdio`, `streamable-http`, or `sse` (legacy; `sse` support is OPTIONAL for clients). Clients MUST support at least one of `stdio` or `streamable-http`. Never infer a transport from the shape of a config object.
- Required server fields for that transport; `command` resolved as a single executable token (no shell command string) and plugin root as default `cwd` for `stdio`; plugin-relative paths MUST begin with `./` and resolve inside the plugin root.
- **Reserved variable rules (Spec §7.2):** `${PLUGIN_ROOT}` and `${PLUGIN_DATA}` are the only spec-defined runtime variables expanded in `args`, `env` values, and `cwd`. An MCP server’s `env` object **MUST NOT** define keys named `PLUGIN_ROOT` or `PLUGIN_DATA` (spec §7.2.2 makes that entry invalid). Furthermore, because some clients (notably Cursor) do not expand `${PLUGIN_ROOT}` / `${PLUGIN_DATA}` in `mcp.json`, adapters MUST check variable-expansion support in `capabilities/features.yaml` and rewrite or flag `partial`/`unsafe` accordingly.
- Remote endpoint configuration — non-loopback HTTP endpoints MUST use HTTPS; plain HTTP is permitted only when the host is `localhost` or a loopback IP literal. Duplicate HTTP header names differing only in case are invalid.
- Environment and authentication requirements — declared per server in `meta.json` (which variables are required vs optional, and which are secrets).

Never embed credentials or API keys in a published plugin. Secret provisioning MUST use the target runtime’s supported authentication or secret-management mechanism, declared per server in `meta.json`.
