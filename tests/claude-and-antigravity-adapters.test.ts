import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ClaudeCodeCliAdapter } from "../build/adapters/anthropic.claude-code.cli/index.ts";
import { AntigravityAppAdapter } from "../build/adapters/google.antigravity.app/index.ts";
import { loadCapabilityRegistry } from "../build/capabilities/registry.ts";
import { normalizePlugin } from "../build/model/normalize.ts";
import { verifyPermissionMatrix } from "../build/translate/permissions.ts";
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

describe("Claude Code & Antigravity adapters + permission matrices", () => {
  it("verifies permission matrices for all adapters and rejects privilege escalation", () => {
    for (const target of ["github.copilot.cli", "anthropic.claude-code.cli", "google.antigravity.app"]) {
      const p = path.join(REPO_ROOT, "build/adapters", target, "permissions.md");
      const res = verifyPermissionMatrix(p);
      expect(res.errors).toEqual([]);
      expect(res.ok).toBe(true);
    }

    const badMatrixDir = fs.mkdtempSync(path.join(os.tmpdir(), "bad-perm-"));
    tempDirs.push(badMatrixDir);
    const badPath = path.join(badMatrixDir, "permissions.md");
    fs.writeFileSync(
      badPath,
      [
        "| Canonical | Level | Native | Notes |",
        "|---|---|---|---|",
        "| `read-only` | 1 | `Bash(*)` | bad |",
        "| `restricted-shell` | 2 | `Bash(*)` | bad |",
        "| `approval-required` | 2 | `prompt` | ok |",
        "| `tool-exclusion` | 1 | `disallow` | ok |",
        "| `auth-required` | 2 | `env` | ok |",
      ].join("\n"),
    );
    const badRes = verifyPermissionMatrix(badPath);
    expect(badRes.ok).toBe(false);
    expect(badRes.errors.some((e) => e.includes("Permission escalation"))).toBe(true);
  });

  it("emits and verifies anthropic.claude-code.cli native layout for dockhand-gitops and prompt-engineering", async () => {
    const adapter = new ClaudeCodeCliAdapter("working-tree", validators);
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase6-claude-"));
    tempDirs.push(outRoot);

    for (const pluginName of ["dockhand-gitops", "prompt-engineering"]) {
      const pluginDir = path.join(REPO_ROOT, "plugins", pluginName);
      const plugin = normalizePlugin(pluginDir, validators);
      const target = plugin.targets.find((t) => t.id === "anthropic.claude-code.cli")!;
      const plan = adapter.plan(plugin, target, registry);
      const outDir = path.join(outRoot, pluginName, "anthropic.claude-code.cli");

      await adapter.emit(plan, pluginDir, outDir);
      const verifyRes = await adapter.verify(outDir);
      expect(verifyRes.errors).toEqual([]);
      expect(verifyRes.ok).toBe(true);
      expect(fs.existsSync(path.join(outDir, ".claude-plugin/plugin.json"))).toBe(true);
      expect(fs.existsSync(path.join(outDir, "skills"))).toBe(true);
    }

    expect(fs.existsSync(path.join(outRoot, "dockhand-gitops/anthropic.claude-code.cli/.mcp.json"))).toBe(true);
  });

  it("emits and verifies google.antigravity.app native layout for dockhand-gitops and prompt-engineering", async () => {
    const adapter = new AntigravityAppAdapter("working-tree", validators);
    const outRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase6-agy-"));
    tempDirs.push(outRoot);

    for (const pluginName of ["dockhand-gitops", "prompt-engineering"]) {
      const pluginDir = path.join(REPO_ROOT, "plugins", pluginName);
      const plugin = normalizePlugin(pluginDir, validators);
      const target = plugin.targets.find((t) => t.id === "google.antigravity.app")!;
      const plan = adapter.plan(plugin, target, registry);
      const outDir = path.join(outRoot, pluginName, "google.antigravity.app");

      await adapter.emit(plan, pluginDir, outDir);
      const verifyRes = await adapter.verify(outDir);
      expect(verifyRes.errors).toEqual([]);
      expect(verifyRes.ok).toBe(true);
      expect(fs.existsSync(path.join(outDir, ".antigravity-plugin/plugin.json"))).toBe(true);
    }

    expect(fs.existsSync(path.join(outRoot, "dockhand-gitops/google.antigravity.app/mcp_config.json"))).toBe(true);
  });
});
