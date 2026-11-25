import fs from "node:fs";
import path from "node:path";
import type { ValidateFunction } from "ajv";
import type { ValidationIssue } from "./validate-plugins.ts";
import { isSuspiciousPathString } from "./validate-plugins.ts";

export interface ComponentValidationResult {
  componentId: string;
  type: "skill" | "mcp-server";
  ok: boolean;
  issues: ValidationIssue[];
}

interface McpServerEntry {
  type?: unknown;
  command?: unknown;
  args?: unknown;
  env?: unknown;
  cwd?: unknown;
  url?: unknown;
  headers?: unknown;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

function isInsideRoot(resolvedTarget: string, resolvedRoot: string): boolean {
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function validateMcpFile(
  pluginName: string,
  mcpJsonPath: string,
  portableRoot: string,
  mcpValidator: ValidateFunction,
): { fileIssues: ValidationIssue[]; serverResults: ComponentValidationResult[] } {
  const fileIssues: ValidationIssue[] = [];
  const serverResults: ComponentValidationResult[] = [];

  let parsed: { $schema?: unknown; mcpServers?: Record<string, McpServerEntry> };
  try {
    parsed = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8")) as {
      $schema?: unknown;
      mcpServers?: Record<string, McpServerEntry>;
    };
  } catch (err) {
    fileIssues.push({
      code: "MCP_JSON_PARSE_ERROR",
      message: `Failed to parse mcp.json: ${String(err)}`,
      file: mcpJsonPath,
    });
    return { fileIssues, serverResults };
  }

  if (!mcpValidator(parsed)) {
    for (const err of mcpValidator.errors ?? []) {
      fileIssues.push({
        code: "MCP_SCHEMA_INVALID",
        message: `mcp.json ${err.instancePath || "/"}: ${err.message ?? "schema error"}`,
        file: mcpJsonPath,
      });
    }
  }

  const resolvedPortableRoot = fs.realpathSync(portableRoot);
  const servers = parsed.mcpServers ?? {};

  for (const [serverName, server] of Object.entries(servers)) {
    const componentId = `${pluginName}:mcp-server:${serverName}`;
    const issues: ValidationIssue[] = [];

    if (!server || typeof server !== "object") {
      issues.push({
        code: "MCP_SERVER_INVALID",
        message: `MCP server "${serverName}" must be an object`,
        file: mcpJsonPath,
      });
      serverResults.push({ componentId, type: "mcp-server", ok: false, issues });
      continue;
    }

    if (server.type === "stdio") {
      if (typeof server.command === "string") {
        if (/\s/.test(server.command.trim())) {
          issues.push({
            code: "MCP_STDIO_SHELL_COMMAND",
            message: `MCP stdio server "${serverName}" command must be a single executable token, not a shell string: "${server.command}"`,
            file: mcpJsonPath,
          });
        }
        const strippedCmd = server.command.replace(/^\$\{PLUGIN_(?:ROOT|DATA)\}\//, "./");
        if (isSuspiciousPathString(strippedCmd)) {
          issues.push({
            code: "MCP_PATH_ESCAPE",
            message: `MCP server "${serverName}" command contains disallowed path traversal: ${server.command}`,
            file: mcpJsonPath,
          });
        } else if (server.command.startsWith("./")) {
          const target = path.resolve(resolvedPortableRoot, server.command);
          if (fs.existsSync(target) && !isInsideRoot(fs.realpathSync(target), resolvedPortableRoot)) {
            issues.push({
              code: "MCP_PATH_ESCAPE",
              message: `MCP server "${serverName}" command resolves outside package root: ${server.command}`,
              file: mcpJsonPath,
            });
          }
        }
      }

      if (typeof server.cwd === "string") {
        const strippedCwd = server.cwd.replace(/^\$\{PLUGIN_(?:ROOT|DATA)\}(?:\/|$)/, "./");
        if (isSuspiciousPathString(strippedCwd)) {
          issues.push({
            code: "MCP_PATH_ESCAPE",
            message: `MCP server "${serverName}" cwd contains disallowed traversal: ${server.cwd}`,
            file: mcpJsonPath,
          });
        } else if (server.cwd.startsWith("./")) {
          const target = path.resolve(resolvedPortableRoot, server.cwd);
          if (fs.existsSync(target) && !isInsideRoot(fs.realpathSync(target), resolvedPortableRoot)) {
            issues.push({
              code: "MCP_PATH_ESCAPE",
              message: `MCP server "${serverName}" cwd resolves outside package root: ${server.cwd}`,
              file: mcpJsonPath,
            });
          }
        }
      }
    } else if (server.type === "streamable-http" || server.type === "sse") {
      if (typeof server.url === "string") {
        try {
          const url = new URL(server.url);
          if (url.protocol === "http:" && !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())) {
            issues.push({
              code: "MCP_INSECURE_HTTP",
              message: `MCP server "${serverName}" non-loopback endpoint must use HTTPS: ${server.url}`,
              file: mcpJsonPath,
            });
          } else if (url.protocol !== "http:" && url.protocol !== "https:") {
            issues.push({
              code: "MCP_INVALID_URL_SCHEME",
              message: `MCP server "${serverName}" URL must use http(s): ${server.url}`,
              file: mcpJsonPath,
            });
          }
        } catch {
          issues.push({
            code: "MCP_INVALID_URL",
            message: `MCP server "${serverName}" has invalid URL: ${server.url}`,
            file: mcpJsonPath,
          });
        }
      }

      if (server.headers && typeof server.headers === "object" && !Array.isArray(server.headers)) {
        const seen = new Map<string, string>();
        for (const headerName of Object.keys(server.headers)) {
          const lower = headerName.toLowerCase();
          const prev = seen.get(lower);
          if (prev !== undefined) {
            issues.push({
              code: "MCP_DUPLICATE_HEADER",
              message: `MCP server "${serverName}" has duplicate HTTP header names differing only in case: "${prev}" and "${headerName}"`,
              file: mcpJsonPath,
            });
          } else {
            seen.set(lower, headerName);
          }
        }
      }
    }

    serverResults.push({
      componentId,
      type: "mcp-server",
      ok: issues.length === 0,
      issues,
    });
  }

  return { fileIssues, serverResults };
}
