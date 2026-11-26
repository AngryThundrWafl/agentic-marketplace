import { execFileSync } from "node:child_process";
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

describe("migrated portable plugins", () => {
  it("validates plugins/dockhand-gitops against Phase 0/1 schemas, containment, and skill rules", () => {
    const res = validatePluginDir(path.join(REPO_ROOT, "plugins/dockhand-gitops"), validators);
    expect(res.issues).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("validates plugins/prompt-engineering against Phase 0/1 schemas, containment, and skill rules", () => {
    const res = validatePluginDir(path.join(REPO_ROOT, "plugins/prompt-engineering"), validators);
    expect(res.issues).toEqual([]);
    expect(res.ok).toBe(true);
  });

  it("installs and lists both portable agent-plugin packages in GitHub Copilot CLI", () => {
    const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "copilot-phase1-"));
    tempDirs.push(isolatedHome);

    const env = { ...process.env, HOME: isolatedHome };
    const dockhandOut = execFileSync(
      "copilot",
      ["plugin", "install", path.join(REPO_ROOT, "plugins/dockhand-gitops/agent-plugin")],
      { env, encoding: "utf8" },
    );
    expect(dockhandOut).toContain('Plugin "dockhand-gitops" installed successfully. Installed 1 skill.');

    const promptOut = execFileSync(
      "copilot",
      ["plugin", "install", path.join(REPO_ROOT, "plugins/prompt-engineering/agent-plugin")],
      { env, encoding: "utf8" },
    );
    expect(promptOut).toContain('Plugin "prompt-engineering" installed successfully. Installed 2 skills.');

    const listOut = execFileSync("copilot", ["plugin", "list"], { env, encoding: "utf8" });
    expect(listOut).toContain("dockhand-gitops (v1.0.1)");
    expect(listOut).toContain("prompt-engineering (v1.4.1)");
  }, 30_000);
});
