import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CopilotCliAdapter } from "../build/adapters/github.copilot.cli/index.ts";
import { loadCapabilityRegistry } from "../build/capabilities/registry.ts";
import type { ContentHashManifest } from "../build/emit/manifest.ts";
import { normalizePlugin } from "../build/model/normalize.ts";
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

describe("github.copilot.cli adapter end-to-end", () => {
  it("emits reproducible, verified dist packages for dockhand-gitops and prompt-engineering", async () => {
    const adapter = new CopilotCliAdapter("working-tree", validators);
    const outRoot1 = fs.mkdtempSync(path.join(os.tmpdir(), "phase5-dist1-"));
    const outRoot2 = fs.mkdtempSync(path.join(os.tmpdir(), "phase5-dist2-"));
    tempDirs.push(outRoot1, outRoot2);

    for (const pluginName of ["dockhand-gitops", "prompt-engineering"]) {
      const pluginDir = path.join(REPO_ROOT, "plugins", pluginName);
      const plugin = normalizePlugin(pluginDir, validators);
      const target = plugin.targets.find((t) => t.id === "github.copilot.cli")!;
      const plan = adapter.plan(plugin, target, registry);

      const out1 = path.join(outRoot1, pluginName, "github.copilot.cli");
      const out2 = path.join(outRoot2, pluginName, "github.copilot.cli");
      await adapter.emit(plan, pluginDir, out1);
      await adapter.emit(plan, pluginDir, out2);

      const verifyRes = await adapter.verify(out1);
      expect(verifyRes.errors).toEqual([]);
      expect(verifyRes.ok).toBe(true);

      const m1 = JSON.parse(fs.readFileSync(path.join(out1, "manifest.json"), "utf8")) as ContentHashManifest;
      const m2 = JSON.parse(fs.readFileSync(path.join(out2, "manifest.json"), "utf8")) as ContentHashManifest;
      expect(m1.outputs).toEqual(m2.outputs);
      expect(m1.inputs).toEqual(m2.inputs);
    }
  });

  it("installs emitted dist artifacts into GitHub Copilot CLI", async () => {
    const adapter = new CopilotCliAdapter("working-tree", validators);
    const distRoot = fs.mkdtempSync(path.join(os.tmpdir(), "phase5-dist-"));
    const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "phase5-copilot-home-"));
    tempDirs.push(distRoot, isolatedHome);

    const env = { ...process.env, HOME: isolatedHome };

    for (const pluginName of ["dockhand-gitops", "prompt-engineering"]) {
      const pluginDir = path.join(REPO_ROOT, "plugins", pluginName);
      const plugin = normalizePlugin(pluginDir, validators);
      const target = plugin.targets.find((t) => t.id === "github.copilot.cli")!;
      const plan = adapter.plan(plugin, target, registry);
      const outDir = path.join(distRoot, pluginName, "github.copilot.cli");
      await adapter.emit(plan, pluginDir, outDir);

      execFileSync("copilot", ["plugin", "install", outDir], { env, encoding: "utf8" });
    }

    const listOut = execFileSync("copilot", ["plugin", "list"], { env, encoding: "utf8" });
    expect(listOut).toContain("dockhand-gitops (v1.0.1)");
    expect(listOut).toContain("prompt-engineering (v1.4.1)");
  }, 30_000);
});
