# Permission Matrix — `google.antigravity.app`

| Canonical Permission | Privilege Level | Native Mapping (`google.antigravity.app`) | Enforcement Notes |
|---|---|---|---|
| `read-only` | 1 | `enabledTools` read-only allowlist in `mcp_config.json` | Tool-level allowlist enforced by Antigravity MCP client. |
| `restricted-shell` | 2 | **No equivalent — fail closed** | Antigravity plugin manifest defines no portable shell allowlist. |
| `approval-required` | 2 | Interactive confirmation gated in skill + UI | Preserved via Antigravity tool confirmation. |
| `tool-exclusion` | 1 | Omission from `enabledTools` in `mcp_config.json` | Excluded tools are not exposed to the agent. |
| `auth-required` | 2 | Antigravity `variables` in `mcp_config.json` | Plugin installs disabled until required variables are configured. |
