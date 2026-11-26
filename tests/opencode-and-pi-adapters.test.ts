import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PiPackageAdapter } from "../build/adapters/earendil.pi.package/index.ts";
import { OpenCodeCliAdapter } from "../build/adapters/opencode.opencode.cli/index.ts";
import { loadCapabilityRegistry } from "../build/capabilities/registry.ts";
import type { ContentHashManifest } from "../build/emit/manifest.ts";
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

describe("opencode.opencode.cli and earendil.pi.package adapters", () => {
  it("verifies permission matrices for opencode.opencode.cli and earendil.pi.package", () => {
    for (const target of ["opencode.opencode.cli", "earendil.pi.package"]) {
      const p = path.join(REPO_ROOT, "build/adapters", target, "permissions.md");
      const res = verifyPermissionMatrix(p);
      expect(res.errors).toEqual([]);
      expect(res.ok).toBe(true);
    }
  });

  it("emits, verifies, and runs behavioral OpenCode CLI checks for dockhand-gitops and prompt-engineering", async () => {
    const adapter = new OpenCodeCliAdapter("working-tree", validators);
    const outRoot1 = fs.mkdtempSync(path.join(os.tmpdir(), "oc-dist1-"));
    const outRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), "oc-dist2-"));
    tempDirs.push(outRoot1, outRoot2);

    for (const pluginName of ["dockhand-gitops", "prompt-engineering"]) {
      const pluginDir = path.join(REPO_ROOT, "plugins", pluginName);
      const plugin = normalizePlugin(pluginDir, validators);
      const target = plugin.targets.find((t) => t.id === "opencode.opencode.cli")!;
      const plan = adapter.plan(plugin, target, registry);

      const out1 = path.join(outRoot1, pluginName, "opencode.opencode.cli");
      const out2 = path.join(outRoot2, pluginName, "opencode.opencode.cli");
      await adapter.emit(plan, pluginDir, out1);
      await adapter.emit(plan, pluginDir, out2);

      const verifyRes = await adapter.verify(out1);
      expect(verifyRes.errors).toEqual([]);
      expect(verifyRes.ok).toBe(true);
      expect(fs.existsSync(path.join(out1, ".opencode/skills"))).toBe(true);

      const m1 = JSON.parse(fs.readFileSync(path.join(out1, "manifest.json"), "utf8")) as ContentHashManifest;
      const m2 = JSON.parse(fs.readFileSync(path.join(out2, "manifest.json"), "utf8")) as ContentHashManifest;
      expect(m1.outputs).toEqual(m2.outputs);
      expect(m1.inputs).toEqual(m2.inputs);
    }

    const dockhandDist = path.join(outRoot1, "dockhand-gitops/opencode.opencode.cli");
    const openCodeConfigPath = path.join(dockhandDist, "opencode.json");
    expect(fs.existsSync(openCodeConfigPath)).toBe(true);
    const openCodeConfig = JSON.parse(fs.readFileSync(openCodeConfigPath, "utf8")) as {
      skills?: string[];
      mcp?: { servers?: { dockhand?: { type?: string; url?: string } } };
    };
    expect(openCodeConfig.skills).toEqual(["./.opencode/skills"]);
    expect(openCodeConfig.mcp?.servers?.dockhand?.type).toBe("remote");
    expect(openCodeConfig.mcp?.servers?.dockhand?.url).toBe("{env:DOCKHAND_MCP_URL}");
    expect(fs.existsSync(path.join(dockhandDist, ".opencode/skills/dockhand-gitops/SKILL.md"))).toBe(true);

    const env = {
      ...process.env,
      DOCKHAND_MCP_URL: "https://example.invalid/mcp",
      DOCKHAND_MCP_AUTH_TOKEN: "test-token",
    };

    const openCodeVersion = execFileSync("opencode", ["--version"], { encoding: "utf8" }).trim();
    const isOpenCodeV2 = /\bv?2\./.test(openCodeVersion);

    const dockhandDebugConfig = execFileSync("opencode", ["debug", "config"], {
      cwd: dockhandDist,
      env,
      encoding: "utf8",
    });
    expect(dockhandDebugConfig).toContain("dockhand");
    expect(dockhandDebugConfig).toContain(".opencode");

    const promptDist = path.join(outRoot1, "prompt-engineering/opencode.opencode.cli");
    const dockhandPkg = JSON.parse(fs.readFileSync(path.join(dockhandDist, "package.json"), "utf8")) as {
      name: string;
      main: string;
      files: string[];
    };
    expect(dockhandPkg.name).toBe("@angrythundrwafl/dockhand-gitops-opencode");
    expect(dockhandPkg.main).toBe("./index.js");
    expect(dockhandPkg.files).toContain(".opencode/skills");
    expect(fs.existsSync(path.join(dockhandDist, "index.js"))).toBe(true);

    const dockhandPluginMod = (await import(path.join(dockhandDist, "index.js"))) as {
      default: () => Promise<{ config: (cfg: Record<string, unknown>) => Promise<void> }>;
    };
    const dockhandPluginHooks = await dockhandPluginMod.default();
    const simulatedOpenCodeConfig: Record<string, unknown> = {};
    await dockhandPluginHooks.config(simulatedOpenCodeConfig);
    expect(simulatedOpenCodeConfig.skills).toEqual([path.join(dockhandDist, ".opencode/skills")]);
    expect(
      (simulatedOpenCodeConfig.mcp as { servers?: { dockhand?: { url?: string } } })?.servers?.dockhand?.url,
    ).toBe("{env:DOCKHAND_MCP_URL}");

    const promptConfig = JSON.parse(fs.readFileSync(path.join(promptDist, "opencode.json"), "utf8")) as {
      skills?: string[];
    };
    expect(promptConfig.skills).toEqual(["./.opencode/skills"]);
    expect(fs.existsSync(path.join(promptDist, ".opencode/skills/prompt-creator/SKILL.md"))).toBe(true);
    expect(fs.existsSync(path.join(promptDist, ".opencode/skills/skill-creator/SKILL.md"))).toBe(true);
    const promptDebugConfig = execFileSync("opencode", ["debug", "config"], {
      cwd: promptDist,
      env,
      encoding: "utf8",
    });
    expect(promptDebugConfig).toContain("./.opencode/skills");
    expect(promptDebugConfig).toContain(".opencode");

    if (isOpenCodeV2) {
      const dockhandApiConfig = execFileSync("opencode", ["api", "--standalone", "GET", "/api/config"], {
        cwd: dockhandDist,
        env,
        encoding: "utf8",
      });
      expect(dockhandApiConfig).toContain("https://example.invalid/mcp");
      expect(dockhandApiConfig).toContain("Bearer test-token");
    } else {
      const dockhandSkills = execFileSync("opencode", ["debug", "skill"], {
        cwd: dockhandDist,
        env,
        encoding: "utf8",
      });
      expect(dockhandSkills).toContain('"name": "dockhand-gitops"');

      const promptSkills = execFileSync("opencode", ["debug", "skill"], {
        cwd: promptDist,
        env,
        encoding: "utf8",
      });
      expect(promptSkills).toContain('"name": "prompt-creator"');
      expect(promptSkills).toContain('"name": "skill-creator"');
    }
  }, 30_000);

  it("emits, verifies, and runs behavioral Pi package install/list checks for dockhand-gitops and prompt-engineering", async () => {
    const adapter = new PiPackageAdapter("working-tree", validators);
    const outRoot1 = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dist1-"));
    const outRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), "pi-dist2-"));
    const isolatedPiDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-home-"));
    tempDirs.push(outRoot1, outRoot2, isolatedPiDir);

    const env = { ...process.env, PI_CODING_AGENT_DIR: isolatedPiDir };

    for (const pluginName of ["dockhand-gitops", "prompt-engineering"]) {
      const pluginDir = path.join(REPO_ROOT, "plugins", pluginName);
      const plugin = normalizePlugin(pluginDir, validators);
      const target = plugin.targets.find((t) => t.id === "earendil.pi.package")!;
      const plan = adapter.plan(plugin, target, registry);

      if (pluginName === "dockhand-gitops") {
        expect(plan.securityWarnings.some((w) => w.includes("DOCKHAND_MCP_URL"))).toBe(true);
      }

      const out1 = path.join(outRoot1, pluginName, "earendil.pi.package");
      const out2 = path.join(outRoot2, pluginName, "earendil.pi.package");
      await adapter.emit(plan, pluginDir, out1);
      await adapter.emit(plan, pluginDir, out2);

      const verifyRes = await adapter.verify(out1);
      expect(verifyRes.errors).toEqual([]);
      expect(verifyRes.ok).toBe(true);

      const pkg = JSON.parse(fs.readFileSync(path.join(out1, "package.json"), "utf8")) as {
        name: string;
        keywords: string[];
        pi: { skills: string[]; extensions?: string[] };
      };
      expect(pkg.name).toBe(`@angrythundrwafl/${pluginName}`);
      expect(pkg.keywords).toContain("pi-package");
      expect(pkg.pi.skills).toEqual(["./skills"]);
      if (pluginName === "dockhand-gitops") {
        expect(pkg.pi.extensions).toEqual(["./extensions"]);
        expect(fs.existsSync(path.join(out1, "extensions/index.js"))).toBe(true);
      }

      const m1 = JSON.parse(fs.readFileSync(path.join(out1, "manifest.json"), "utf8")) as ContentHashManifest;
      const m2 = JSON.parse(fs.readFileSync(path.join(out2, "manifest.json"), "utf8")) as ContentHashManifest;
      expect(m1.outputs).toEqual(m2.outputs);
      expect(m1.inputs).toEqual(m2.inputs);

      execFileSync("pi", ["install", out1], { env, encoding: "utf8" });
    }

    const listOut = execFileSync("pi", ["list"], { env, encoding: "utf8" });
    expect(listOut).toContain("dockhand-gitops");
    expect(listOut).toContain("prompt-engineering");
  }, 30_000);
});
