import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginValidators, validatePluginDir } from "../build/validate-plugins.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const validators = loadPluginValidators(REPO_ROOT);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createTempPlugin(
  name: string,
  opts: {
    mcpJson?: Record<string, unknown>;
    skills?: Record<string, string>;
    extraFile?: { relPath: string; content: string };
  },
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `phase2-${name}-`));
  tempDirs.push(dir);

  fs.mkdirSync(path.join(dir, "agent-plugin/skills"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "agent-plugin/plugin.json"),
    JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name,
      version: "1.0.0",
    }),
  );
  fs.writeFileSync(
    path.join(dir, "meta.json"),
    JSON.stringify({
      targets: [{ id: "github.copilot.cli", packageFormat: "agent-plugins-1.0" }],
      components: [
        {
          id: `${name}:skill:default`,
          source: "agent-plugin/skills/default/SKILL.md",
          optional: false,
          translations: { "github.copilot.cli": "exact" },
        },
      ],
    }),
  );

  const skills = opts.skills ?? {
    default: "---\nname: default\ndescription: Default valid skill.\n---\n\n# Default\n",
  };
  for (const [skillName, content] of Object.entries(skills)) {
    const skillDir = path.join(dir, "agent-plugin/skills", skillName);
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), content);
  }

  if (opts.mcpJson) {
    fs.writeFileSync(path.join(dir, "agent-plugin/mcp.json"), JSON.stringify(opts.mcpJson));
  }

  if (opts.extraFile) {
    const target = path.join(dir, opts.extraFile.relPath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, opts.extraFile.content);
  }

  return dir;
}

describe("MCP validation, secrets scan, and per-component isolation", () => {
  it("rejects non-loopback plain HTTP MCP endpoints", () => {
    const dir = createTempPlugin("mcp-http-remote", {
      mcpJson: {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          remote: { type: "streamable-http", url: "http://example.com/mcp" },
        },
      },
    });
    const res = validatePluginDir(dir, validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "MCP_INSECURE_HTTP")).toBe(true);
  });

  it("allows loopback HTTP MCP endpoints (localhost and 127.0.0.1)", () => {
    const dir = createTempPlugin("mcp-http-loopback", {
      mcpJson: {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          local1: { type: "streamable-http", url: "http://localhost:3000/mcp" },
          local2: { type: "streamable-http", url: "http://127.0.0.1:8080/mcp" },
        },
      },
    });
    const res = validatePluginDir(dir, validators);
    expect(res.issues).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("rejects duplicate HTTP header names differing only in case", () => {
    const dir = createTempPlugin("mcp-dup-headers", {
      mcpJson: {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          api: {
            type: "streamable-http",
            url: "https://api.example.com/mcp",
            headers: {
              Authorization: "Bearer ${API_TOKEN}",
              authorization: "Bearer ${API_TOKEN}",
            },
          },
        },
      },
    });
    const res = validatePluginDir(dir, validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "MCP_DUPLICATE_HEADER")).toBe(true);
  });

  it("rejects stdio commands containing shell command strings", () => {
    const dir = createTempPlugin("mcp-stdio-shell", {
      mcpJson: {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          runner: {
            type: "stdio",
            command: "node ./server.js",
          },
        },
      },
    });
    const res = validatePluginDir(dir, validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "MCP_STDIO_SHELL_COMMAND")).toBe(true);
  });

  it("fails closed when a secret is detected in plugin files", () => {
    const fakeToken = ["ghp", "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456"].join("_");
    const dir = createTempPlugin("secret-leak", {
      extraFile: {
        relPath: "agent-plugin/skills/default/notes.md",
        content: `Do not commit ${fakeToken}\n`,
      },
    });
    const res = validatePluginDir(dir, validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "SECRET_DETECTED")).toBe(true);
  });

  it("isolates component failures so a bad skill or MCP server does not invalidate valid skills", () => {
    const dir = createTempPlugin("isolation-test", {
      skills: {
        "good-skill": "---\nname: good-skill\ndescription: Valid skill.\n---\n\n# Good\n",
        "bad-skill": "# Missing frontmatter\n",
      },
      mcpJson: {
        $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
        mcpServers: {
          "good-mcp": { type: "streamable-http", url: "https://mcp.example.com/mcp" },
          "bad-mcp": { type: "streamable-http", url: "http://mcp.example.com/mcp" },
        },
      },
    });

    const res = validatePluginDir(dir, validators);
    expect(res.ok).toBe(false);
    expect(res.fatalIssues).toEqual([]);

    const goodSkill = res.components?.find((c) => c.componentId === "isolation-test:skill:good-skill");
    const badSkill = res.components?.find((c) => c.componentId === "isolation-test:skill:bad-skill");
    const goodMcp = res.components?.find((c) => c.componentId === "isolation-test:mcp-server:good-mcp");
    const badMcp = res.components?.find((c) => c.componentId === "isolation-test:mcp-server:bad-mcp");

    expect(goodSkill?.ok).toBe(true);
    expect(badSkill?.ok).toBe(false);
    expect(goodMcp?.ok).toBe(true);
    expect(badMcp?.ok).toBe(false);
  });
});
