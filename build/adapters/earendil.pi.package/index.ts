import fs from "node:fs";
import path from "node:path";
import type { CapabilityRegistry } from "../../capabilities/registry.ts";
import { writeContentManifest } from "../../emit/manifest.ts";
import type { NormalizedPlugin, TargetConfig } from "../../model/component.ts";
import { generateCompatibilityReport, renderCompatibilityMarkdown } from "../../translate/compatibility.ts";
import { verifyPermissionMatrix } from "../../translate/permissions.ts";
import { buildTranslationPlan, type TranslationPlan } from "../../translate/plan.ts";
import { checkDirectoryContainment, loadPluginValidators, type PluginValidators } from "../../validate-plugins.ts";
import type { EmissionResult, HarnessAdapter, VerificationResult } from "../types.ts";

export class PiPackageAdapter implements HarnessAdapter {
  readonly id = "earendil.pi.package";
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
    const plan = buildTranslationPlan(
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

    if (plugin.secrets.length > 0) {
      plan.securityWarnings.push(
        "Pi packages do not define a portable MCP component; configure an external Pi MCP extension or user MCP settings for required servers.",
      );
    }

    return plan;
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
    fs.mkdirSync(outputDir, { recursive: true });

    for (const docFile of ["README.md", "LICENSE"]) {
      const srcDoc = path.join(pluginDir, docFile);
      if (fs.existsSync(srcDoc)) {
        fs.copyFileSync(srcDoc, path.join(outputDir, docFile));
      }
    }

    const piResources: Record<string, string[]> = {};
    const skillsSrc = path.join(pluginDir, "agent-plugin/skills");
    if (fs.existsSync(skillsSrc)) {
      fs.cpSync(skillsSrc, path.join(outputDir, "skills"), { recursive: true });
      piResources.skills = ["./skills"];
    }

    const overrideDir = path.join(pluginDir, "overrides", this.id);
    if (fs.existsSync(overrideDir)) {
      fs.cpSync(overrideDir, outputDir, { recursive: true });
    }

    const sourceManifest = JSON.parse(
      fs.readFileSync(path.join(pluginDir, "agent-plugin/plugin.json"), "utf8"),
    ) as {
      name: string;
      version?: string;
      description?: string;
      author?: { name?: string };
      license?: string;
      keywords?: string[];
    };

    const keywords = Array.from(new Set(["pi-package", ...(sourceManifest.keywords ?? [])]));
    const piPackageJson = {
      name: sourceManifest.name,
      ...(sourceManifest.version ? { version: sourceManifest.version } : {}),
      ...(sourceManifest.description ? { description: sourceManifest.description } : {}),
      ...(sourceManifest.author?.name ? { author: sourceManifest.author.name } : {}),
      ...(sourceManifest.license ? { license: sourceManifest.license } : {}),
      keywords,
      pi: piResources,
    };

    fs.writeFileSync(
      path.join(outputDir, "package.json"),
      `${JSON.stringify(piPackageJson, null, 2)}\n`,
    );

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
    checkDirectoryContainment(outputDir, containmentIssues, "pi dist output");
    for (const issue of containmentIssues) {
      errors.push(`${issue.code}: ${issue.message}`);
    }

    const pkgPath = path.join(outputDir, "package.json");
    if (!fs.existsSync(pkgPath)) {
      errors.push("Missing package.json");
    } else {
      const parsed = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as {
        name?: unknown;
        keywords?: unknown;
        pi?: { skills?: unknown };
      };
      if (typeof parsed.name !== "string" || parsed.name.length === 0) {
        errors.push("package.json missing required name");
      }
      if (!Array.isArray(parsed.keywords) || !parsed.keywords.includes("pi-package")) {
        errors.push('package.json keywords must include "pi-package"');
      }
      if (!parsed.pi || !Array.isArray(parsed.pi.skills) || parsed.pi.skills.length === 0) {
        errors.push("package.json pi.skills must declare at least one skill directory");
      } else {
        for (const rel of parsed.pi.skills) {
          if (typeof rel !== "string" || !fs.existsSync(path.resolve(outputDir, rel))) {
            errors.push(`package.json pi.skills path does not exist: ${String(rel)}`);
          }
        }
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
