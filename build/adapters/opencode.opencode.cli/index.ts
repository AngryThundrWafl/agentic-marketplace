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

export class OpenCodeCliAdapter implements HarnessAdapter {
  readonly id = "opencode.opencode.cli";
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
    fs.mkdirSync(path.join(outputDir, ".opencode"), { recursive: true });

    for (const docFile of ["README.md", "LICENSE"]) {
      const srcDoc = path.join(pluginDir, docFile);
      if (fs.existsSync(srcDoc)) {
        fs.copyFileSync(srcDoc, path.join(outputDir, docFile));
      }
    }

    const skillsSrc = path.join(pluginDir, "agent-plugin/skills");
    if (fs.existsSync(skillsSrc)) {
      fs.cpSync(skillsSrc, path.join(outputDir, ".opencode/skills"), { recursive: true });
    }

    const canonicalMappings: Array<{ src: string; dest: string }> = [
      { src: "canonical/agents", dest: ".opencode/agents" },
      { src: "canonical/commands", dest: ".opencode/commands" },
    ];
    for (const m of canonicalMappings) {
      const srcPath = path.join(pluginDir, m.src);
      if (fs.existsSync(srcPath)) {
        fs.cpSync(srcPath, path.join(outputDir, m.dest), { recursive: true });
      }
    }

    const overrideDir = path.join(pluginDir, "overrides", this.id);
    if (fs.existsSync(overrideDir)) {
      fs.cpSync(overrideDir, outputDir, { recursive: true });
    }

    const openCodeConfigPath = path.join(outputDir, "opencode.json");
    const hasSkills = fs.existsSync(path.join(outputDir, ".opencode/skills"));
    let openCodeConfig: Record<string, unknown> = {};
    if (fs.existsSync(openCodeConfigPath)) {
      openCodeConfig = JSON.parse(fs.readFileSync(openCodeConfigPath, "utf8")) as Record<string, unknown>;
    }
    if (!openCodeConfig.$schema) {
      openCodeConfig.$schema = "https://opencode.ai/config.json";
    }
    if (hasSkills && !openCodeConfig.skills) {
      openCodeConfig.skills = ["./.opencode/skills"];
    }
    fs.writeFileSync(openCodeConfigPath, `${JSON.stringify(openCodeConfig, null, 2)}\n`);

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

    const mcpServers =
      openCodeConfig.mcp &&
      typeof openCodeConfig.mcp === "object" &&
      "servers" in openCodeConfig.mcp &&
      openCodeConfig.mcp.servers &&
      typeof openCodeConfig.mcp.servers === "object"
        ? (openCodeConfig.mcp.servers as Record<string, unknown>)
        : {};

    const pluginEntrySource = `import path from "node:path";
import { fileURLToPath } from "node:url";

const PKG_DIR = path.dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = path.join(PKG_DIR, ".opencode/skills");
const MCP_SERVERS = ${JSON.stringify(mcpServers, null, 2)};

/**
 * OpenCode plugin entrypoint registering bundled skills and MCP servers.
 */
export default async function () {
  return {
    config: async (config) => {
      const existingSkills = Array.isArray(config.skills) ? config.skills : [];
      if (${String(hasSkills)} && !existingSkills.includes(SKILLS_DIR)) {
        config.skills = [...existingSkills, SKILLS_DIR];
      }
      if (Object.keys(MCP_SERVERS).length > 0) {
        config.mcp = config.mcp && typeof config.mcp === "object" ? config.mcp : {};
        const existingServers =
          config.mcp.servers && typeof config.mcp.servers === "object" ? config.mcp.servers : {};
        config.mcp.servers = { ...MCP_SERVERS, ...existingServers };
      }
    },
  };
}
`;
    fs.writeFileSync(path.join(outputDir, "index.js"), pluginEntrySource);

    const publishFiles = [
      "index.js",
      ...(hasSkills ? [".opencode/skills"] : []),
      ...["README.md", "LICENSE", "CHANGELOG.md"].filter((docFile) => fs.existsSync(path.join(outputDir, docFile))),
    ];
    const openCodePkgJson = {
      name: `@angrythundrwafl/${sourceManifest.name}-opencode`,
      ...(sourceManifest.version ? { version: sourceManifest.version } : {}),
      ...(sourceManifest.description ? { description: sourceManifest.description } : {}),
      ...(sourceManifest.author?.name ? { author: sourceManifest.author.name } : {}),
      ...(sourceManifest.license ? { license: sourceManifest.license } : {}),
      keywords: Array.from(new Set(["opencode", "opencode-plugin", ...(sourceManifest.keywords ?? [])])),
      repository: {
        type: "git",
        url: "git+https://github.com/AngryThundrWafl/agentic-marketplace.git",
      },
      type: "module",
      main: "./index.js",
      exports: {
        ".": "./index.js",
      },
      files: publishFiles,
      publishConfig: {
        access: "public",
      },
    };
    fs.writeFileSync(
      path.join(outputDir, "package.json"),
      `${JSON.stringify(openCodePkgJson, null, 2)}\n`,
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
    checkDirectoryContainment(outputDir, containmentIssues, "opencode dist output");
    for (const issue of containmentIssues) {
      errors.push(`${issue.code}: ${issue.message}`);
    }

    const skillsDir = path.join(outputDir, ".opencode/skills");
    if (!fs.existsSync(skillsDir)) {
      errors.push("Missing .opencode/skills directory");
    }

    const openCodeConfigPath = path.join(outputDir, "opencode.json");
    if (!fs.existsSync(openCodeConfigPath)) {
      errors.push("Missing opencode.json");
    } else {
      try {
        const parsed = JSON.parse(fs.readFileSync(openCodeConfigPath, "utf8")) as Record<string, unknown>;
        if (parsed.$schema !== "https://opencode.ai/config.json") {
          errors.push("opencode.json must declare $schema: https://opencode.ai/config.json");
        }
        if (fs.existsSync(skillsDir) && (!Array.isArray(parsed.skills) || parsed.skills.length === 0)) {
          errors.push("opencode.json must declare skills paths when .opencode/skills exists");
        }
        if (parsed.mcp !== undefined) {
          const mcp = parsed.mcp as Record<string, unknown> | null;
          if (!mcp || typeof mcp !== "object" || !mcp.servers || typeof mcp.servers !== "object") {
            errors.push("opencode.json mcp must declare a servers object for OpenCode v2");
          }
        }
      } catch (err) {
        errors.push(`Invalid opencode.json: ${String(err)}`);
      }
    }

    const compatPath = path.join(outputDir, "compatibility.json");
    if (!fs.existsSync(compatPath)) {
      errors.push("Missing compatibility.json");
    } else if (!this.validators.compatibility(JSON.parse(fs.readFileSync(compatPath, "utf8")))) {
      errors.push("Emitted compatibility.json failed schema validation");
    }

    const pkgPath = path.join(outputDir, "package.json");
    if (!fs.existsSync(pkgPath)) {
      errors.push("Missing package.json for OpenCode npm plugin");
    } else {
      const parsedPkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { name?: unknown; main?: unknown };
      if (typeof parsedPkg.name !== "string" || parsedPkg.name.length === 0) {
        errors.push("package.json missing required name");
      }
      if (parsedPkg.main !== "./index.js") {
        errors.push("package.json main must point to ./index.js");
      }
    }
    if (!fs.existsSync(path.join(outputDir, "index.js"))) {
      errors.push("Missing index.js for OpenCode npm plugin");
    }

    if (!fs.existsSync(path.join(outputDir, "COMPATIBILITY.md"))) errors.push("Missing COMPATIBILITY.md");
    if (!fs.existsSync(path.join(outputDir, "manifest.json"))) errors.push("Missing manifest.json");

    return { ok: errors.length === 0, errors };
  }

  async dryRun(plan: TranslationPlan): Promise<TranslationPlan> {
    return plan;
  }
}
