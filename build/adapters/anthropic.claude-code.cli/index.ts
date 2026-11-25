import fs from "node:fs";
import path from "node:path";
import type { CapabilityRegistry } from "../../capabilities/registry.ts";
import { writeContentManifest } from "../../emit/manifest.ts";
import type { NormalizedPlugin, TargetConfig } from "../../model/component.ts";
import { emitCanonicalForClaude } from "../../translate/canonical.ts";
import { generateCompatibilityReport, renderCompatibilityMarkdown } from "../../translate/compatibility.ts";
import { verifyPermissionMatrix } from "../../translate/permissions.ts";
import { buildTranslationPlan, type TranslationPlan } from "../../translate/plan.ts";
import { checkDirectoryContainment, loadPluginValidators, type PluginValidators } from "../../validate-plugins.ts";
import type { EmissionResult, HarnessAdapter, VerificationResult } from "../types.ts";

export class ClaudeCodeCliAdapter implements HarnessAdapter {
  readonly id = "anthropic.claude-code.cli";
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

    const permPath = path.join(path.dirname(new URL(import.meta.url).pathname), "permissions.md");
    const permRes = verifyPermissionMatrix(permPath);
    if (!permRes.ok) {
      throw new Error(`Permission matrix check failed for ${this.id}: ${permRes.errors.join("; ")}`);
    }

    fs.rmSync(outputDir, { recursive: true, force: true });
    fs.mkdirSync(path.join(outputDir, ".claude-plugin"), { recursive: true });

    const sourceManifest = JSON.parse(
      fs.readFileSync(path.join(pluginDir, "agent-plugin/plugin.json"), "utf8"),
    ) as { name: string; version?: string; description?: string; author?: unknown; license?: string };

    const claudeManifest = {
      name: sourceManifest.name,
      ...(sourceManifest.version ? { version: sourceManifest.version } : {}),
      ...(sourceManifest.description ? { description: sourceManifest.description } : {}),
      ...(sourceManifest.author ? { author: sourceManifest.author } : {}),
      ...(sourceManifest.license ? { license: sourceManifest.license } : {}),
    };
    fs.writeFileSync(
      path.join(outputDir, ".claude-plugin/plugin.json"),
      `${JSON.stringify(claudeManifest, null, 2)}\n`,
    );

    for (const docFile of ["README.md", "LICENSE"]) {
      const srcDoc = path.join(pluginDir, docFile);
      if (fs.existsSync(srcDoc)) {
        fs.copyFileSync(srcDoc, path.join(outputDir, docFile));
      }
    }

    const skillsSrc = path.join(pluginDir, "agent-plugin/skills");
    if (fs.existsSync(skillsSrc)) {
      fs.cpSync(skillsSrc, path.join(outputDir, "skills"), { recursive: true });
    }

    emitCanonicalForClaude(pluginDir, outputDir);

    const overrideDir = path.join(pluginDir, "overrides", this.id);
    if (fs.existsSync(overrideDir)) {
      fs.cpSync(overrideDir, outputDir, { recursive: true });
    }

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
    checkDirectoryContainment(outputDir, containmentIssues, "claude dist output");
    for (const issue of containmentIssues) {
      errors.push(`${issue.code}: ${issue.message}`);
    }

    const claudeManifestPath = path.join(outputDir, ".claude-plugin/plugin.json");
    if (!fs.existsSync(claudeManifestPath)) {
      errors.push("Missing .claude-plugin/plugin.json");
    } else {
      const parsed = JSON.parse(fs.readFileSync(claudeManifestPath, "utf8")) as { name?: unknown };
      if (typeof parsed.name !== "string" || parsed.name.length === 0) {
        errors.push(".claude-plugin/plugin.json missing required name");
      }
    }

    // Claude Code ignores skills/commands/agents if placed inside .claude-plugin/
    for (const forbidden of ["skills", "commands", "agents", "hooks"]) {
      if (fs.existsSync(path.join(outputDir, ".claude-plugin", forbidden))) {
        errors.push(`Component directory "${forbidden}/" must be at emitted root, not inside .claude-plugin/`);
      }
    }

    const compatPath = path.join(outputDir, "compatibility.json");
    if (!fs.existsSync(compatPath)) {
      errors.push("Missing compatibility.json");
    } else if (!this.validators.compatibility(JSON.parse(fs.readFileSync(compatPath, "utf8")))) {
      errors.push("Emitted compatibility.json failed schema validation");
    }

    if (!fs.existsSync(path.join(outputDir, "COMPATIBILITY.md"))) errors.push("Missing COMPATIBILITY.md");
    if (!fs.existsSync(path.join(outputDir, "manifest.json"))) errors.push("Missing manifest.json");

    return { ok: errors.length === 0, errors };
  }

  async dryRun(plan: TranslationPlan): Promise<TranslationPlan> {
    return plan;
  }
}
