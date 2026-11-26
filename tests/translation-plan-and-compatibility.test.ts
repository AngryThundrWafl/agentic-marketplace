import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadCapabilityRegistry } from "../build/capabilities/registry.ts";
import { normalizePlugin } from "../build/model/normalize.ts";
import { generateCompatibilityReport, renderCompatibilityMarkdown } from "../build/translate/compatibility.ts";
import { buildTranslationPlan } from "../build/translate/plan.ts";
import { loadPluginValidators } from "../build/validate-plugins.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const validators = loadPluginValidators(REPO_ROOT);
const registry = loadCapabilityRegistry(REPO_ROOT, validators.capability, new Date("2026-11-25T12:00:00Z"));

describe("translation planning and compatibility report generation", () => {
  it("plans dockhand-gitops for github.copilot.cli and emits a schema-valid compatibility.json + COMPATIBILITY.md", () => {
    const plugin = normalizePlugin(path.join(REPO_ROOT, "plugins/dockhand-gitops"), validators);
    const target = plugin.targets.find((t) => t.id === "github.copilot.cli")!;
    const plan = buildTranslationPlan(plugin, target, registry, "0.1.0");

    expect(plan.blockingFailures).toEqual([]);
    const report = generateCompatibilityReport(plan);
    expect(validators.compatibility(report)).toBe(true);
    expect(report.emitted).toHaveLength(1);
    expect(report.omitted).toHaveLength(5);

    const md = renderCompatibilityMarkdown(report);
    expect(md).toContain("dockhand-gitops (1.0.1)");
    expect(md).toContain("github.copilot.cli");
    expect(md).toContain("DOCKHAND_MCP_URL");
  });

  it("fails closed when a required component is unsupported", () => {
    const plugin = normalizePlugin(path.join(REPO_ROOT, "plugins/prompt-engineering"), validators);
    const modified = {
      ...plugin,
      components: plugin.components.map((c) =>
        c.id === "prompt-engineering:skill:prompt-creator"
          ? { ...c, optional: false, translations: { ...c.translations, "github.copilot.cli": "unsupported" as const } }
          : c,
      ),
    };
    const target = modified.targets.find((t) => t.id === "github.copilot.cli")!;
    const plan = buildTranslationPlan(modified, target, registry, "0.1.0");
    expect(plan.blockingFailures.some((f) => f.includes("Required component"))).toBe(true);
    expect(() => generateCompatibilityReport(plan)).toThrow(/blocking failures/);
  });

  it("fails closed when partial status omits omittedFeatures in meta.json", () => {
    const plugin = normalizePlugin(path.join(REPO_ROOT, "plugins/prompt-engineering"), validators);
    const modified = {
      ...plugin,
      components: plugin.components.map((c) =>
        c.id === "prompt-engineering:skill:prompt-creator"
          ? { ...c, translations: { ...c.translations, "github.copilot.cli": "partial" as const } }
          : c,
      ),
    };
    const target = modified.targets.find((t) => t.id === "github.copilot.cli")!;
    const plan = buildTranslationPlan(modified, target, registry, "0.1.0");
    expect(plan.blockingFailures.some((f) => f.includes("omittedFeatures"))).toBe(true);
  });

  it("fails closed on unsafe status", () => {
    const plugin = normalizePlugin(path.join(REPO_ROOT, "plugins/prompt-engineering"), validators);
    const modified = {
      ...plugin,
      components: plugin.components.map((c) =>
        c.id === "prompt-engineering:skill:prompt-creator"
          ? { ...c, translations: { ...c.translations, "github.copilot.cli": "unsafe" as const } }
          : c,
      ),
    };
    const target = modified.targets.find((t) => t.id === "github.copilot.cli")!;
    const plan = buildTranslationPlan(modified, target, registry, "0.1.0");
    expect(plan.blockingFailures.some((f) => f.includes("unsafe"))).toBe(true);
  });
});
