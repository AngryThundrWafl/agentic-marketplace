# Changelog

## 1.0.2 (2026-11-26)
- Read `DOCKHAND_MCP_URL` and `DOCKHAND_MCP_AUTH_TOKEN` from `process.env` in the Pi MCP extension and skip registration when `DOCKHAND_MCP_URL` is unset.
- Updated emitted OpenCode v2 plugin `index.js` entrypoint to export `{ id, setup }`.

## 1.0.1 (2026-11-25)
- Migrated into `agentic-marketplace` Rule 0 layout (`agent-plugin/` portable root + `overrides/` for Antigravity and Claude Code).
- Improved prompting hygiene in `SKILL.md` and `references/gitops-validation.md`.
- Generalized GitOps repository and host topology discovery.

## 1.0.0 (2026-11-25)
- Initial release of `dockhand-gitops`.
