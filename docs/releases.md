# Generated Artifacts, Distribution, and Versioning

> **Parent contract:** [architecture.md](architecture.md) (boundaries and invariants win on conflict).

---

## 1. Output policy

Generated output MUST never become a second source of truth. Release artifacts MUST be reproducibly generated, validated, and retained, with:

- a content-hash manifest (`dist/<plugin>/<target>/manifest.json`) listing every input file + hash and every output file + hash;
- the compatibility report (`compatibility.json` + `COMPATIBILITY.md`);
- the SBOM (**CycloneDX 1.6 JSON**) and provenance bundle, with **Sigstore Cosign keyless OIDC** detached `.sig` / `.bundle` signatures alongside SHA-256 checksums (`cosign verify-blob --bundle <artifact>.bundle <artifact>`).

If any of those three is missing or stale, the artifact is not a release.

---

## 2. Commit vs. Exclude

- **Commit:** `plugins/<plugin-name>/` (`agent-plugin/`, `canonical/`, `overrides/`, `meta.json`, `tests/`, docs), `build/` (including `build/adapters/`), `capabilities/` (including `evidence/`), `schemas/`, repo-level `tests/`, `docs/`, `pnpm-lock.yaml`, and small committed marketplace catalog inputs explicitly listed in this document with their regeneration command and freshness check.
- **Never commit:** `dist/`, temporary staging directories, intermediate normalized JSON, local caches, `node_modules/`, or test runtime state.

---

## 3. Publish and marketplace generation

Publish versioned artifacts per target capability (portable Agent Plugins packages, Claude Code plugin distributions, Codex/ChatGPT marketplace or ZIP bundles, Cursor plugin distributions, Copilot marketplace packages, Antigravity packages, Pi npm packages, OpenCode npm packages, and direct Git skills distribution from `agent-plugin/skills/`).

The marketplace generator MUST:

- emit target-valid catalog schemas (e.g. `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json`, `.agents/plugins/`);
- use valid source URLs/paths and immutable version references where supported;
- derive target compatibility metadata directly from `compatibility.json` (never hand-written claims);
- exclude development-only plugins (`developmentOnly: true` in `meta.json`) and any plugin with zero `exact` / `equivalent` components for that target.

---

## 4. Plugin & adapter SemVer

Independent SemVer per plugin and per adapter. Whether a build/adapter change requires a plugin version bump is determined mechanically by comparing output hashes in `dist/<plugin>/<target>/manifest.json`. Spec upgrades (e.g. Agent Plugins `1.0.0` → `1.1.0`) are explicit migrations with pinned schemas, compatibility tests, and loss reports.
