import fs from "node:fs";
import path from "node:path";
import type { CapabilityRegistry } from "../../capabilities/registry.ts";
import { writeContentManifest } from "../../emit/manifest.ts";
import type { NormalizedPlugin, TargetConfig } from "../../model/component.ts";
import { generateCompatibilityReport, renderCompatibilityMarkdown } from "../../translate/compatibility.ts";
import { buildTranslationPlan, type TranslationPlan } from "../../translate/plan.ts";
import { checkDirectoryContainment, loadPluginValidators, type PluginValidators } from "../../validate-plugins.ts";
import type { EmissionResult, HarnessAdapter, VerificationResult } from "../types.ts";

export class CopilotCliAdapter implements HarnessAdapter {
  readonly id = "github.copilot.cli";
  readonly version = "0.1.0";
  readonly capabilityRegistryVersion: string;
  private readonly validators: PluginValidators;

  constructor(
    capabilityRegistryVersion = "working-tree",
    validators = loadPluginValidators(),
  ) {
    this.capabilityRegistryVersion = capabilityRegistryVersion;
    this.validators = validators;
  }

  capabilities(registry: CapabilityRegistry): Record<string, unknown> {
    return (registry.features[this.id] ?? {}) as unknown as Record<string, unknown>;
  }

  plan(
    plugin: NormalizedPlugin,
    target: TargetConfig,
    registry: CapabilityRegistry,
    equivalenceTests: Record<string, string> = {},
  ): TranslationPlan {
    return buildTranslationPlan(
      plugin,
      target,
      registry,
      this.version,
      {
        sourceCommit: "working-tree",
        adapterVersion: this.version,
        capabilityRegistryVersion: this.capabilityRegistryVersion,
        buildId: "deterministic",
      },
      equivalenceTests,
    );
  }

  async emit(plan: TranslationPlan, pluginDir: string, outputDir: string): Promise<EmissionResult> {
    if (plan.blockingFailures.length > 0) {
      throw new Error(`Refusing to emit ${plan.plugin.name} for ${this.id}: ${plan.blockingFailures.join("; ")}`);
    }

    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(outputDir, { recursive: true });

    const portableSrc = path.join(pluginDir, "agent-plugin");
    fs.cpSync(portableSrc, outputDir, { recursive: true });

    const report = generateCompatibilityReport(plan);
    const compatibilityPath = path.join(outputDir, "compatibility.json");
    fs.writeFileSync(compatibilityPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(path.join(outputDir, "COMPATIBILITY.md"), renderCompatibilityMarkdown(report));

    const manifestPath = writeContentManifest(outputDir, pluginDir, {
      plugin: plan.plugin.name,
      version: plan.plugin.version,
      target: this.id,
      adapterVersion: this.version,
      capabilityRegistryVersion: this.capabilityRegistryVersion,
    });

    return {
      ok: true,
      outputDir,
      filesWritten: fs.readdirSync(outputDir),
      manifestPath,
      compatibilityPath,
    };
  }

  async verify(outputDir: string): Promise<VerificationResult> {
    const errors: string[] = [];
    const containmentIssues: Array<{ code: string; message: string }> = [];
    checkDirectoryContainment(outputDir, containmentIssues, "dist output");
    for (const issue of containmentIssues) {
      errors.push(`${issue.code}: ${issue.message}`);
    }

    const pluginJsonPath = path.join(outputDir, "plugin.json");
    if (!fs.existsSync(pluginJsonPath)) {
      errors.push("Missing plugin.json in emitted output");
    } else {
      const pj = JSON.parse(fs.readFileSync(pluginJsonPath, "utf8")) as Record<string, unknown>;
      if (!this.validators.plugin(pj)) {
        errors.push("Emitted plugin.json failed schema validation");
      }
    }

    const compatPath = path.join(outputDir, "compatibility.json");
    if (!fs.existsSync(compatPath)) {
      errors.push("Missing compatibility.json");
    } else {
      const cj = JSON.parse(fs.readFileSync(compatPath, "utf8")) as Record<string, unknown>;
      if (!this.validators.compatibility(cj)) {
        errors.push("Emitted compatibility.json failed schema validation");
      }
    }

    if (!fs.existsSync(path.join(outputDir, "COMPATIBILITY.md"))) {
      errors.push("Missing COMPATIBILITY.md");
    }
    if (!fs.existsSync(path.join(outputDir, "manifest.json"))) {
      errors.push("Missing manifest.json");
    }

    return { ok: errors.length === 0, errors };
  }

  async dryRun(plan: TranslationPlan): Promise<TranslationPlan> {
    return plan;
  }
}
