# Permission Matrix — `anthropic.claude-code.cli`

| Canonical Permission | Privilege Level | Native Mapping (`anthropic.claude-code.cli`) | Enforcement Notes |
|---|---|---|---|
| `read-only` | 1 | `allowed-tools` read-only toolset (`Read`, `Grep`, `Glob`) | Enforced by Claude Code tool permission prompt. |
| `restricted-shell` | 2 | Scoped `Bash(...)` allowlist pattern | Never mapped to unrestricted `Bash(*)`. |
| `approval-required` | 2 | Default interactive permission prompt | User approval required before execution. |
| `tool-exclusion` | 1 | `disallowedTools` explicit denylist | Preserved in native agent/plugin config. |
| `auth-required` | 2 | Environment variables in `.mcp.json` (`${VAR}`) | Secrets never embedded; MCP runs outside sandbox. |
