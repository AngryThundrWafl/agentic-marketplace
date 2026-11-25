# Validation and Testing

> **Parent contract:** [architecture.md](architecture.md) (boundaries and invariants win on conflict).

Validation MUST operate at multiple levels in CI. A check not run in CI does not exist.

1. **Source validation:** Closed `plugin.json` schema (`additionalProperties: false`), Agent Skills frontmatter & budgets, `mcp.json` schema + forbidden `PLUGIN_ROOT`/`PLUGIN_DATA` env keys, path containment, dependency declarations, `meta.json` & capability schemas, and secrets scan. Collect all errors per plugin rather than aborting on the first.
2. **Structural output validation:** Emitted directory layout per `packageFormat`, manifest validity, reference integrity (every referenced file exists in `dist/<plugin>/<target>/`), intra-package and target-namespace duplicate identity checks, unsupported-field detection, `compatibility.json` schema validity, and permission-matrix verification.
3. **Golden tests:** Version-pinned fixtures per adapter covering happy paths, variable rewrites (`${PLUGIN_ROOT}`), permission-matrix fail-closed cases, unmapped tool/model errors, optional omissions, and required-component failures.
4. **Behavioral integration tests:** Install emitted packages into actual harness CLIs/runtimes inside the sandbox profile defined below, verifying discovery, installation, visibility, skill activation, MCP connection, agent/command/hook execution, permission-boundary denial, dependency resolution, and loud failure on malformed components.
   - **Sandbox profile:** Rootless OCI container (`node:22-bookworm-slim` base image), `--network=none` by default (explicit allowlist only for remote-MCP tests), `--read-only` root filesystem with ephemeral `tmpfs` `/tmp`, `--cpus=1`, `--memory=1g`, and `60s` per-test timeout.
5. **CI release gate:** Fails scoped to `(plugin, target, component)` on any source/structural/behavioral failure, `unsafe` or undeclared `partial`/`unsupported` required component, weakened security semantics, secret finding, stale/non-reproducible hash manifest, unpinned dependency, mutable marketplace ref, missing provenance/SBOM/compatibility report, or stale (`> 90d`) capability evidence.
