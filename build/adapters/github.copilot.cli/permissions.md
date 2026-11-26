# Permission Matrix — `github.copilot.cli`

| Canonical Permission | Privilege Level | Native Mapping (`github.copilot.cli`) | Enforcement Notes |
|---|---|---|---|
| `read-only` | 1 | Preserved via skill instructions + Copilot CLI tool approval prompts | `allowed-tools` is treated as a hint only, never a security boundary. |
| `restricted-shell` | 2 | **No equivalent — fail closed** for un-approved shell automation | Copilot CLI does not enforce portable skill-level shell allowlists. |
| `approval-required` | 2 | Interactive user confirmation before mutating actions | Preserved by Copilot CLI default tool confirmation. |
| `tool-exclusion` | 1 | **No equivalent — fail closed** | Cannot be enforced purely by `plugin.json`; requires server-side allowlist (e.g. `MCP_TOOLS_ALLOW`). |
| `auth-required` | 2 | External environment / `~/.copilot/mcp-config.json` | Secrets never embedded in emitted `dist/` packages. |
