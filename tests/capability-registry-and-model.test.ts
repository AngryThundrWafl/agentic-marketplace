import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isEvidenceStale, loadCapabilityRegistry } from "../build/capabilities/registry.ts";
import { normalizePlugin } from "../build/model/normalize.ts";
import { loadPluginValidators } from "../build/validate-plugins.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const validators = loadPluginValidators(REPO_ROOT);
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("capability registry and NormalizedPlugin model", () => {
  it("loads capabilities/harnesses.yaml, features.yaml, and validates all evidence files", () => {
    const registry = loadCapabilityRegistry(REPO_ROOT, validators.capability, new Date("2026-11-25T12:00:00Z"));
    expect(registry.harnesses.length).toBeGreaterThanOrEqual(4);
    expect(registry.evidence.length).toBeGreaterThanOrEqual(4);
    expect(registry.staleEvidence).toEqual([]);

    const copilot = registry.evidence.find((e) => e.targetId === "github.copilot.cli");
    expect(copilot?.status).toBe("standard");
    expect(copilot?.testedRuntimeVersion).toBe("1.0.114");
  });

  it("flags capability evidence older than 90 days as stale", () => {
    expect(isEvidenceStale("2026-08-01", new Date("2026-11-25T00:00:00Z"))).toBe(true);
    expect(isEvidenceStale("2026-11-25", new Date("2026-11-25T00:00:00Z"))).toBe(false);
  });

  it("normalizes dockhand-gitops and prompt-engineering into typed NormalizedPlugin models", () => {
    const dockhand = normalizePlugin(path.join(REPO_ROOT, "plugins/dockhand-gitops"), validators);
    expect(dockhand.name).toBe("dockhand-gitops");
    expect(dockhand.version).toBe("1.0.1");
    expect(dockhand.secrets.map((s) => s.name)).toEqual(["DOCKHAND_MCP_URL", "DOCKHAND_MCP_AUTH_TOKEN"]);
    expect(dockhand.components.some((c) => c.id === "dockhand-gitops:skill:dockhand-gitops")).toBe(true);

    const promptEng = normalizePlugin(path.join(REPO_ROOT, "plugins/prompt-engineering"), validators);
    expect(promptEng.name).toBe("prompt-engineering");
    expect(promptEng.version).toBe("1.4.1");
    expect(promptEng.components.filter((c) => c.type === "skill")).toHaveLength(2);
  });

  it("fails closed when an override file is not declared in meta.json", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "phase3-unlisted-"));
    tempDirs.push(dir);
    fs.cpSync(path.join(REPO_ROOT, "tests/fixtures/validation/valid-minimal"), dir, { recursive: true });
    fs.mkdirSync(path.join(dir, "overrides/github.copilot.cli"), { recursive: true });
    fs.writeFileSync(path.join(dir, "overrides/github.copilot.cli/extra.json"), "{}");

    expect(() => normalizePlugin(dir, validators)).toThrow(/Unlisted component/);
  });
});
