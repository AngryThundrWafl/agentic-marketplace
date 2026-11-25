# Security Architecture

> **Parent contract:** [architecture.md](architecture.md) (boundaries and invariants win on conflict).

Security is a build-time and runtime concern. Schema validation checks shape; it does not check intent.

---

## 1. Threat model

Assume that:

- plugin source can contain malicious instructions, including prompt-injection payloads in skills, rules, descriptions, and examples;
- skill `description` fields can manipulate activation routing (since agents use `description` to decide when to load a skill);
- scripts and native extensions can execute arbitrary code with user privileges;
- MCP servers can access external systems, exfiltrate data, and persist across sessions;
- dependencies can be compromised;
- symlinks, junctions, and archive entries can escape intended directories;
- generated configuration can unintentionally broaden permissions — including by mapping a restrictive permission to a broader native one, or to a field the target ignores;
- a marketplace / catalog entry can point at a mutable branch or a different artifact than the one reviewed.

---

## 2. Path containment

All package-relative paths MUST resolve inside the package root (matching Agent Plugins 1.0.0 §4.1). Validation MUST account for:

- `..` traversal, absolute paths, Windows drive and UNC paths, encoded traversal (`%2e%2e`, Unicode normalization);
- symlink, junction, and reparse-point escapes and symlink loops — intra-root symlinks whose resolved targets remain inside the package root MAY be permitted where a target supports them, but any symlink resolving outside the package root MUST be rejected;
- case-insensitive filesystem collisions (critical for macOS/Windows portability);
- archive extraction traversal (validate every entry before extraction).

Perform containment checks on **resolved** filesystem paths (`fs.realpathSync`), not merely normalized strings. Avoid TOCTOU vulnerabilities by staging builds in isolated temporary directories. The build MUST run containment checks on both `plugins/<plugin-name>/` and the emitted `dist/<plugin>/<target>/` tree.

---

## 3. Execution boundaries & mandatory release reviews

Scripts and extensions MUST declare their runtime requirements (interpreter, version, tools, network, filesystem, secrets). Build validation MUST identify all executable components and their dependencies.

Do not execute plugin scripts during ordinary structural validation. Behavioral tests MUST execute untrusted components inside isolated environments with restricted filesystem access, network access, credentials, and privileges. “Isolated” MUST be defined as a concrete container / sandbox profile in [testing.md](testing.md) (with CPU, memory, timeout, network, and mount limits listed), not a bare `npm test` on a developer machine.

Every release MUST pass two mandatory checks:

1. **Secrets scan** — zero credentials, API keys, tokens, or private keys in any shipped file (including examples, fixtures, and `dist/`). Any finding fails the release.
2. **Instruction & activation review** — a human (or a named, versioned automated policy check whose digest is recorded) reviews `SKILL.md` bodies, `description` activation triggers, rules, and hook scripts for prompt-injection, activation-hijacking, and privilege-escalation attempts. The review outcome is recorded in provenance; an unreviewed plugin MUST NOT be published to a public marketplace.

---

## 4. Permission preservation

Security controls are non-negotiable translation requirements:

- read-only tool access MUST NOT become write access;
- restricted shell execution MUST NOT become unrestricted execution;
- approval-required operations MUST NOT become automatic operations;
- explicit tool exclusions MUST NOT disappear;
- authentication requirements MUST NOT be silently bypassed.

An adapter that cannot preserve these guarantees MUST fail closed.

**Each adapter MUST ship a tested permission matrix** (`build/adapters/<target>/permissions.md`): every canonical permission maps to (a) one native permission, (b) an explicit “no equivalent — fail closed”, or (c) a reviewed alternative recorded in `meta.json`. A canonical permission with no row in the matrix is a build error. A matrix that maps two distinct canonical permissions with different privilege levels to the same broader native permission MUST flag the privilege escalation and fail.

Note on `allowed-tools` in Agent Skills: it is experimental and support varies across runtimes. It MUST NOT be the sole enforcement mechanism for any security requirement. Treat it as a hint; enforce permissions in the adapter matrix and the target’s native controls.

---

## 5. Supply chain

- Pin all build dependencies via `pnpm-lock.yaml`. Unpinned dependencies fail the release gate.
- Generate SHA-256 release checksums for every artifact.
- Record source commit, build environment, lockfile hash, adapter versions, capability-registry commit, instruction-review attestation, and artifact digests in provenance for every release.
- Generate an SBOM in **CycloneDX 1.6 JSON** (or **SPDX 2.3 JSON**, standardized repo-wide in [releases.md](releases.md)) for every published package.
- Sign releases where supported, with per-target signing mechanism, key management (e.g. Sigstore Cosign keyless OIDC for OCI/tarball artifacts), and verification command specified in [releases.md](releases.md). Because Agent Plugins 1.0.0 defines no native signature envelope, targets without a native signature mechanism MUST ship detached `.sig` / `.bundle` artifacts alongside SHA-256 manifests and explicitly document target-side verification support.
- Marketplace catalog entries MUST pin an immutable version reference (git commit SHA, immutable tag, or content digest) where the target supports it. A marketplace entry pointing at a moving branch is not a release artifact.
