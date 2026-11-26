# Architecture — Refined (v2)

> **Status:** Refined contract, 2026-11-25 (incorporates second adversarial review and upstream spec/harness verification; see [migration-plan.md](migration-plan.md#appendix-a--second-adversarial-review-log)).
> **Scope:** This document is the architectural contract and navigation hub for this monorepo. It defines boundaries and invariants only. Detailed contracts and procedures live one level deep in `docs/` (see the Contract Map below). Where this document and a linked doc disagree, this document wins on boundaries and invariants; the linked doc wins on procedure.
> **Normative language:** The words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, RECOMMENDED, MAY, and OPTIONAL in this document are to be interpreted as described in RFC 2119 / RFC 8174 when, and only when, they appear in ALL CAPS. Lowercase “must” / “should” is descriptive, not normative.
>
> **What this document does not do:** It does not prove any harness supports any feature. A claim in this document is a *strategy* or a *rule for how to prove support*, never evidence of support. Evidence lives only in `capabilities/evidence/`.

---

## 0. The core distinction: three roots + reusable adapters

A multi-harness plugin monorepo fails when it conflates authoring layout, portable package layout, emitted target layout, and harness adapter code:

1. **Authoring root** — `plugins/<plugin-name>/`, where humans edit plugin source.
2. **Portable package root** — `plugins/<plugin-name>/agent-plugin/`, the exact directory published as an Agent Plugins 1.0.0 package.
3. **Emitted target root** — `dist/<plugin>/<target>/`, generated per harness surface.
4. **Harness adapters** — `build/adapters/<target>/`, reusable target translators owned by the build system (NOT duplicated inside every plugin).

Those roots MUST NOT be the same directory, and they MUST NOT be treated as interchangeable.

Agent Plugins 1.0.0 is a *fixed-layout* package format. A conformant package root contains only `plugin.json`, `skills/`, `mcp.json`, and reverse-domain client-extension directories (e.g. `com.github.copilot/`). It does **not** contain un-namespaced `agents/`, `commands/`, `rules/`, `hooks/`, `overrides/`, or `tests/` at its root.

**Rule 0 — the three-roots rule:**

- Author portable skills and MCP config **inside** the portable root, `plugins/<plugin-name>/agent-plugin/`. That directory *is* the portable package. Do not copy or restructure it to publish it as an Agent Plugin.
- Author non-portable canonical components **outside** that root, under `plugins/<plugin-name>/canonical/`. They are source for translation, never shipped as-is in the portable package.
- Author reusable target translation logic once in `build/adapters/<target>/`. Author per-plugin hand-written native overrides (only when canonical translation cannot express a required native feature) under `plugins/<plugin-name>/overrides/<target>/`.
- Generate all target-specific packages into `dist/<plugin>/<target>/`. `dist/` is never source.

If a component cannot be placed under one of those locations without duplication, the model is wrong — fix the model, do not duplicate the component.

---

## 1. Architectural principles

### 1.1 Portable core, native extensions

Agent Plugins 1.0.0 standardizes exactly two portable component types:

1. Agent Skills (`skills/<skill-name>/SKILL.md`).
2. MCP servers (`mcp.json`).

It also defines a manifest (`plugin.json`), a fixed package structure, reverse-domain extension namespaces, path-containment rules, and minimum client loading semantics. It does **not** define a permission model, provenance, cryptographic signatures, sandboxing, portable secret management, a marketplace protocol, an agent runtime, or MCP wire behaviour. Do not attribute those properties to the spec. This repo MUST supply them at the build / release layer, or explicitly state that they are absent for a given target.

Agents, commands, rules, hooks, LSP configurations, TypeScript extensions, output styles, monitors, and themes are **not** portable Agent Plugins 1.0 components. They MUST be represented as exactly one of:

- a reverse-domain client extension inside `agent-plugin/<reverse-domain>/` (and/or `extensions["<reverse-domain>"]` in `plugin.json`) where documented by that client; or
- a canonical component under `canonical/` with a verified translation to a target; or
- a per-plugin native override under `overrides/<target>/` emitted into `dist/<plugin>/<target>/`, accompanied by a translation/compatibility report.

Never claim standard-level portability for a component merely because its files can be packaged into multiple harnesses. Packaging is not portability. Installation is not execution. Execution is not semantic equivalence.

### 1.2 Single source of truth

All maintained plugin source lives under `plugins/<plugin-name>/`. All maintained harness translation logic lives under `build/adapters/<target>/`. Generated artifacts are derived from source and are never manually maintained.

**Exceptions are narrow and listed, not discretionary:** repository-level infrastructure (`.github/`, root `package.json`, `pnpm-workspace.yaml`, `schemas/`, `build/`, `capabilities/`), and small committed marketplace catalogs explicitly designated as release inputs in [releases.md](releases.md). If a generated file is committed and is not on that list, it is a bug. “Small” means: a catalog listing plugin names, versions, compatibility summaries, and immutable source references — never a full generated harness tree.

### 1.3 Semantic preservation over format compatibility

Adapters MUST preserve the meaning of the source component. Translation is not successful because the target accepts the generated file.

| Status | Meaning | Release behaviour |
|---|---|---|
| `exact` | Semantics preserved directly | Allowed |
| `equivalent` | Native equivalent verified by a test named in the report | Allowed |
| `partial` | Some non-critical functionality omitted | Allowed only if declared in `meta.json` and in the loss report, and every omitted part is listed by name |
| `unsupported` | Target cannot represent the component | Skip only if the component is declared `optional` in `meta.json`; otherwise fail |
| `unsafe` | Security or required semantics cannot be preserved | **Fail closed** — no release, no override by packaging alone |

Security restrictions, authorization requirements, tool allowlists, and approval requirements MUST never be silently dropped, weakened, renamed into a weaker form, or moved to a field the target ignores. If an adapter cannot preserve a security-relevant requirement, it MUST fail the build unless an explicitly reviewed alternative (named reviewer, date, exact alternative) is recorded in an ADR and referenced from `meta.json`.

### 1.4 Explicit capabilities

Harness capabilities are versioned, evidence-backed data. Support is evaluated against a **product surface** (`<vendor>.<product>.<surface>`), not a vendor name. Capabilities MUST use one status vocabulary everywhere: `native`, `standard`, `adapter`, `preview`, `experimental`, `unsupported`, `unknown`. `unknown` MUST never be rendered, shipped, or marketed as supported.

### 1.5 Progressive disclosure and budgets

Skills and context SHOULD load only the information needed for the current task. Use the **published** Agent Skills budgets, not invented monorepo limits:

- `name`: 1–64 chars, lowercase alphanumeric + single hyphens (`a-z`, `0-9`, `-`), MUST match parent directory name.
- `description`: 1–1024 chars, non-empty, load-bearing for activation (include what it does and trigger phrases for when to use it).
- `SKILL.md` body: `< 500` lines and `< 5000` tokens RECOMMENDED.
- `compatibility`: `≤ 500` chars when present.
- `allowed-tools`: space-delimited string; **experimental** in Agent Skills — never rely on it as a security boundary.
- File references from `SKILL.md` SHOULD be one level deep; avoid deep reference chains.
- Target-specific budgets belong in `capabilities/features.yaml` per target, with a validation test that enforces them.

### 1.6 Reproducible builds

Identical source, dependencies, adapter versions, capability-registry commit, and build configuration MUST produce byte-equivalent artifacts (or differences explained in provenance, e.g. `SOURCE_DATE_EPOCH`). Build outputs MUST be deterministic and traceable to their inputs via a content-hash manifest.

### 1.7 Per-component failure isolation

Agent Plugins 1.0 clients and this build MUST treat components independently: one invalid skill or MCP server MUST NOT invalidate an otherwise valid plugin (except for fatal manifest/containment violations), and one invalid plugin MUST NOT invalidate a marketplace. The build MUST report the failing component, continue validating the rest where safe, and fail the release only for the affected target / plugin — with exact scope `(plugin, target, component)`.

---

## 2. Repository structure

```text
agent-plugins/
├── plugins/
│   └── <plugin-name>/
│       ├── meta.json                  # internal metadata — NEVER in portable package
│       ├── README.md
│       ├── CHANGELOG.md
│       ├── LICENSE
│       ├── agent-plugin/              # *** exact Agent Plugins 1.0.0 package root ***
│       │   ├── plugin.json            # portable manifest, closed schema
│       │   ├── skills/<skill-name>/   # SKILL.md + optional references/, scripts/, assets/
│       │   ├── mcp.json               # portable MCP config
│       │   └── <reverse-domain>/      # reverse-domain client extensions ONLY
│       ├── canonical/                 # non-portable source: agents/, commands/, rules/, hooks/
│       ├── overrides/<target-id>/     # optional per-plugin hand-written native overrides
│       └── tests/                     # optional per-plugin tests (repo suites live in /tests/)
├── schemas/                           # pinned 1.0.0 plugin/mcp schemas + schemas/internal/
├── build/                             # TypeScript build & adapters (build/adapters/<target>/)
├── capabilities/                      # harnesses.yaml, features.yaml, evidence/
├── marketplaces/                      # committed catalog inputs ONLY
├── tests/                             # *.test.ts suites, fixtures/, sandbox/
├── dist/                              # generated — never committed, never hand-edited
├── docs/                              # architecture.md + one-level-deep contract docs
├── package.json
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.json
└── .github/workflows/
```

**Language decision:** the build and adapters are TypeScript (`build/**/*.ts`, `tsconfig.json`). If that changes, update this section and the pipeline in the same commit.

**Per-plugin minimum:** Every plugin MUST contain a conformant `agent-plugin/plugin.json`, a meaningful description and stable `name`, at least one actual component declared in `meta.json`, a `README.md` (purpose, installation, supported surfaces with versions, execution/secret security notes), and a `meta.json` declaring targets and `required` vs `optional` components.

---

## 3. Contract map (load on demand)

Read only the linked doc needed for your active task (all links are one level deep from `docs/architecture.md`):

| Area | Contract Document | Covers |
|---|---|---|
| Portable Package | [portable-contract.md](portable-contract.md) | Agent Plugins 1.0.0 spec guard, allowed `agent-plugin/` entries, `plugin.json` closed schema, SemVer discipline, Agent Skills, `mcp.json` rules & `${PLUGIN_ROOT}` |
| Canonical & Build | [canonical-and-build.md](canonical-and-build.md) | 9-stage build pipeline, `NormalizedPlugin` component model, translation statuses, `compatibility.json` / `COMPATIBILITY.md`, `meta.json` schema & rules |
| Harnesses & Adapters | [harnesses.md](harnesses.md) | Surface IDs (`vendor.product.surface`), 15 capability dimensions, evidence & 90-day staleness, initial target strategy, `HarnessAdapter` interface, per-harness notes |
| Security | [security.md](security.md) | Threat model, resolved path containment, execution boundaries, secrets & instruction review, permission matrices (`permissions.md`), SBOM/signing/supply chain |
| Releases & Artifacts | [releases.md](releases.md) | `dist/` output policy, commit vs exclude rules, marketplace catalog generation, plugin & adapter SemVer |
| Validation & Testing | [testing.md](testing.md) | CI 5-level validation (source, structural, golden, behavioral sandbox, release gate) |
| Migration & Decisions | [migration-plan.md](migration-plan.md) | Phases 0–10 migration plan, non-goals, 10 architectural decision rules, primary references, Appendix A (review log), Appendix B (open pre-Phase 1 decisions) |
