# Permission Matrix — `opencode.opencode.cli`

| Canonical Permission | Privilege Level | Native Mapping (`opencode.opencode.cli`) | Enforcement Notes |
|---|---|---|---|
| `read-only` | 1 | `permission` rule restricting `edit`/`bash` to `ask` or `deny` | Enforced by OpenCode permission configuration in `opencode.json`. |
| `restricted-shell` | 2 | Scoped `permission.bash` command pattern map | Never mapped to unrestricted shell auto-approval. |
| `approval-required` | 2 | `"ask"` permission policy | Interactive user approval required before execution. |
| `tool-exclusion` | 1 | `"deny"` entry in `opencode.json` `permission` map | Explicitly blocks disallowed tools. |
| `auth-required` | 2 | `{env:VAR}` interpolation in `opencode.json` `mcp.<name>` | Secrets never embedded in config files. |
