# Canonical Model and Build Architecture

> **Parent contract:** [architecture.md](architecture.md) (boundaries and invariants win on conflict).

The repository uses a normalized internal representation (`build/model/`) to decouple authoring from target emission. The normalized representation is an implementation detail, not another public plugin specification. Do not publish it, do not let adapters depend on an unstable internal shape, and do not let it leak into `plugin.json`.

---

## 1. Source directory ownership

| Directory | Responsibility | Ships as |
|---|---|---|
| `agent-plugin/` | Portable Agent Plugins 1.0.0 package root | Published as-is (portable) |
| `agent-plugin/skills/` | Portable Agent Skills | Portable |
| `agent-plugin/mcp.json` | Portable MCP server definitions | Portable |
| `agent-plugin/<reverse-domain>/` | One client’s extension files, ignored by other clients | Portable package, client-specific |
| `canonical/agents/` | Canonical agent definitions, where translation is meaningful | Translated to a target root, or omitted with a report |
| `canonical/commands/` | Canonical command / prompt definitions | Translated, or omitted with a report |
| `canonical/rules/` | Canonical reusable instructions | Translated, or omitted with a report |
| `canonical/hooks/` | Hook definitions and supporting scripts | Translated only if the target has a verified equivalent; otherwise `unsupported` / `unsafe` |
| `overrides/<target-id>/` | Per-plugin hand-written native overrides (only when canonical translation is insufficient) | Merged/emitted into `dist/<plugin>/<target>/` |
| `build/adapters/<target>/` | Reusable target adapters + `permissions.md` matrices | Build-time translator; never shipped inside a plugin |
| `meta.json` | Internal metadata: targets, optionality, budgets, secrets, translation declarations | **Never shipped in the portable package** |
| `tests/` | Plugin-level and repo-level verification | Never shipped |
| `capabilities/` | Versioned capability registry + evidence | Never shipped in a plugin |
| `marketplaces/` | Committed catalog inputs | Catalogs, not plugin packages |

---

## 2. Build pipeline

```text
Canonical source + overrides (authoring root)
      |
      v
Discovery                 — find components; reject unknown top-level entries in agent-plugin/
      |
      v
Source validation         — spec schemas, naming, path containment, secrets scan
      |                     (per-component; collect all errors, do not stop at the first)
      v
Normalized component model
      |
      +---------------------+
      |                     |
      v                     v
Capability resolution   Dependency analysis
 (per target)            (declared deps only; undeclared = error)
      |                     |
      +----------+----------+
                 |
                 v
         Translation planning      — per component per target: exact / equivalent /
                 |                   partial / unsupported / unsafe
                 v
          Target emission          — build/adapters/<target>/ + overrides/<target>/
                 |                   emitted to dist/<plugin>/<target>/
                 v
          Package assembly         — portable root validated verbatim; target root assembled
                 |
                 v
       Structural verification     — manifests, references, duplicates, loss report present
                 |
                 v
       Behavioral verification     — install + invoke in the real harness where practical
                 |
                 v
         Release artifacts         — hash manifest, SBOM, provenance, signatures
```

Each stage MUST produce a machine-readable result and MUST NOT proceed past a gate on a security failure (`unsafe`, secrets found, path escape). A stage that only logs a warning for a security failure is a defect.

**Staleness and reproducibility check:** package assembly MUST compare a content hash of all inputs (`agent-plugin/`, `canonical/`, `overrides/<target>/`, `meta.json`, adapter version, capability-registry commit, lockfile) against the hash recorded in `dist/<plugin>/<target>/manifest.json`. If inputs changed and the artifact did not, the build fails as stale. If the artifact changed and inputs did not, the build fails as non-reproducible.

---

## 3. Component model

Every discovered component MUST have, in typed TypeScript form (`build/model/component.ts`):

- stable component identifier (`<plugin>:<type>:<name>`);
- component type (`skill` | `mcp-server` | `agent` | `command` | `rule` | `hook` | `native-override`);
- source location (authoring-root-relative path);
- source format and version;
- declared dependencies — type, name, version constraint, and whether the dependency is a runtime, a tool, an MCP server, or another plugin/component;
- `required` | `optional` (from `meta.json`; default is `required` — silence is not optionality);
- target compatibility information (a reference to capability entries, not a free-text claim);
- security requirements (tools allowed, approval required, network / filesystem / secrets needed);
- translation status per target;
- provenance (source commit, adapter version, capability-registry commit, build id).

Component-specific metadata MUST remain typed. An unvalidated generic record that lets adapters invent fields or silently reinterpret semantics is forbidden.

**Dependencies:** a component MUST NOT depend on a tool, binary, package, MCP server, or sibling plugin that is not declared in `meta.json` or in the component itself. The build MUST resolve every declared dependency per target and MUST fail if a target cannot provide it, unless the component is `optional` and the loss report records the omission. Runtime dependency management (installing a binary, an npm package, or a Python package) is a per-target capability, not a portable guarantee.

---

## 4. Translation results & loss report

Each target translation produces a structured result per component (`exact`, `equivalent`, `partial`, `unsupported`, `unsafe` per [architecture.md](architecture.md#13-semantic-preservation-over-format-compatibility)):

- `partial` is only valid if every omitted feature is **named** in both `meta.json` and the loss report.
- `equivalent` is only valid if a **named test** in `tests/` verifies the semantic equivalence.

An adapter MUST NOT report success merely because it generated syntactically valid files.

Every generated target artifact MUST include a machine-readable compatibility report in `dist/<plugin>/<target>/compatibility.json` **and** a human-readable `COMPATIBILITY.md` alongside it, validated against `schemas/internal/compatibility.schema.json`.

The report MUST identify, per component:

- components emitted, with translation status and adapter version;
- components omitted, with reason and `required` / `optional`;
- features rewritten or omitted by name (including variable rewrites such as `${PLUGIN_ROOT}` → `${CURSOR_PLUGIN_ROOT}`);
- required dependencies and whether each was resolved on that target;
- native extensions or overrides included, with their source and version;
- unsupported functionality;
- security-related translation warnings — including any permission that changed form or any component running outside a sandbox (e.g. Claude Code hooks/MCP servers);
- adapter version, capability-registry version (git commit of `capabilities/`), and build provenance.

The report MUST be available to both CI and consumers. A package shipped without a current report is a failed release.

---

## 5. Internal metadata — `meta.json`

All repo-internal metadata lives in `plugins/<plugin-name>/meta.json`, validated against `schemas/internal/meta.schema.json`. It MUST NOT appear in `plugin.json` and MUST NOT be shipped inside `agent-plugin/`.

```json
{
  "$schema": "../../schemas/internal/meta.schema.json",
  "targets": [
    { "id": "github.copilot.cli", "minVersion": "1.0.0", "packageFormat": "agent-plugins-1.0" },
    { "id": "anysphere.cursor.ide", "minVersion": "3.13.0", "packageFormat": "cursor-native" }
  ],
  "components": [
    {
      "id": "my-plugin:agent:reviewer",
      "source": "canonical/agents/reviewer.md",
      "optional": false,
      "translations": {
        "anthropic.claude-code.cli": "equivalent",
        "anysphere.cursor.ide": "equivalent",
        "github.copilot.cli": "unsupported"
      }
    }
  ],
  "budgets": { "skillDescriptionMaxChars": 1024 },
  "secrets": [
    { "name": "EXAMPLE_API_KEY", "required": true, "provisioning": "target-secret-store" }
  ],
  "reviewedAlternatives": []
}
```

Rules:

- Every canonical component and override MUST be listed. An unlisted component is not built for any target.
- When a target supports multiple package formats (e.g. portable `agent-plugins-1.0` vs native `.cursor-plugin` or `.claude-plugin`), `targets[].packageFormat` MUST declare which format `dist/<plugin>/<target>/` emits so the two formats are never mixed in one output root.
- Every `partial` / `unsupported` / `unsafe` outcome MUST be declared in `meta.json` *before* the build runs, or the build MUST fail.
- `reviewedAlternatives` holds the ADR reference, named reviewer, date, and exact alternative for any security-relevant alternative.
