# Permission Matrix — `earendil.pi.package`

| Canonical Permission | Privilege Level | Native Mapping (`earendil.pi.package`) | Enforcement Notes |
|---|---|---|---|
| `read-only` | 1 | `pi --tools read,grep,find,ls` | Restricts session to read-only built-in tools. |
| `restricted-shell` | 2 | Scoped `--tools` / `--exclude-tools` or extension gate | Never mapped to unrestricted shell auto-approval. |
| `approval-required` | 2 | Interactive confirmation or extension tool_call hook | User approval required before mutating actions. |
| `tool-exclusion` | 1 | `--exclude-tools <list>` | Explicitly disables specified built-in or extension tools. |
| `auth-required` | 2 | Environment variables for external MCP extension | Pi packages do not embed secrets; MCP requires a separate extension. |
