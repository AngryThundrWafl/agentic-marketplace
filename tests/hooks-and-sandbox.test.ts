import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCodeCliAdapter } from "../build/adapters/anthropic.claude-code.cli/index.ts";
import { loadCapabilityRegistry } from "../build/capabilities/registry.ts";
import { normalizePlugin } from "../build/model/normalize.ts";
import { buildSandboxDockerArgs } from "../build/sandbox/runner.ts";
import { loadPluginValidators } from "../build/validate-plugins.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const validators = loadPluginValidators(REPO_ROOT);
const registry = loadCapabilityRegistry(REPO_ROOT, validators.capability, new Date("2026-11-25T12:00:00Z"));
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("canonical hooks, overrides, and sandbox profile", () => {
  it("constructs rootless OCI sandbox args with --network=none, --read-only, CPU, and memory limits", () => {
    const args = buildSandboxDockerArgs("/tmp/plugin-dist", ["node", "--version"]);
    expect(args).toContain("--network=none");
    expect(args).toContain("--read-only");
    expect(args).toContain("--cpus=1");
    expect(args).toContain("--memory=1g");
    expect(args).toContain("node:22-bookworm-slim");
  });

  it("emits canonical hooks and agents into Claude Code root in an isolated temp fixture", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase8-hooks-"));
    const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase8-out-"));
    tempDirs.push(dir, outDir);

    fs.mkdirSync(path.join(dir, "agent-plugin/skills/hello"), { recursive: true });
    fs.mkdirSync(path.join(dir, "canonical/hooks"), { recursive: true });
    fs.mkdirSync(path.join(dir, "canonical/agents"), { recursive: true });

    fs.writeFileSync(
      path.join(dir, "agent-plugin/plugin.json"),
      JSON.stringify({
        $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
        name: "hooked-plugin",
        version: "1.0.0",
      }),
    );
    fs.writeFileSync(
      path.join(dir, "agent-plugin/skills/hello/SKILL.md"),
      "---\nname: hello\ndescription: Hello skill.\n---\n\n# Hello\n",
    );
    fs.writeFileSync(path.join(dir, "canonical/hooks/hooks.json"), JSON.stringify({ hooks: [] }));
    fs.writeFileSync(path.join(dir, "canonical/agents/reviewer.md"), "# Reviewer Agent\n");
    fs.writeFileSync(
      path.join(dir, "meta.json"),
      JSON.stringify({
        targets: [{ id: "anthropic.claude-code.cli", packageFormat: "claude-native" }],
        components: [
          {
            id: "hooked-plugin:skill:hello",
            source: "agent-plugin/skills/hello/SKILL.md",
            optional: false,
            translations: { "anthropic.claude-code.cli": "exact" },
          },
          {
            id: "hooked-plugin:hook:hooks",
            source: "canonical/hooks/hooks.json",
            optional: false,
            translations: { "anthropic.claude-code.cli": "equivalent" },
          },
          {
            id: "hooked-plugin:agent:reviewer",
            source: "canonical/agents/reviewer.md",
            optional: false,
            translations: { "anthropic.claude-code.cli": "equivalent" },
          },
        ],
      }),
    );

    const plugin = normalizePlugin(dir, validators);
    const adapter = new ClaudeCodeCliAdapter("working-tree", validators);
    const plan = adapter.plan(plugin, plugin.targets[0]!, registry, {
      "hooked-plugin:hook:hooks": "tests/hooks-and-sandbox.test.ts",
      "hooked-plugin:agent:reviewer": "tests/hooks-and-sandbox.test.ts",
    });

    await adapter.emit(plan, dir, outDir);
    const verifyRes = await adapter.verify(outDir);
    expect(verifyRes.ok).toBe(true);
    expect(fs.existsSync(path.join(outDir, "hooks/hooks.json"))).toBe(true);
    expect(fs.existsSync(path.join(outDir, "agents/reviewer.md"))).toBe(true);
  });
});
