import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import type { ValidateFunction } from "ajv";
import { scanDirectoryForSecrets } from "./secrets-scan.ts";
import { validateMcpFile, type ComponentValidationResult } from "./validate-mcp.ts";

type Ajv2020Ctor = new (opts?: Record<string, unknown>) => {
  compile: (schema: Record<string, unknown>) => ValidateFunction;
};
type AddFormatsFn = (ajv: unknown) => unknown;

const Ajv2020 = ((Ajv2020Module as unknown as { default?: Ajv2020Ctor }).default ?? Ajv2020Module) as unknown as Ajv2020Ctor;
const addFormats = ((addFormatsModule as unknown as { default?: AddFormatsFn }).default ?? addFormatsModule) as unknown as AddFormatsFn;

export interface ValidationIssue {
  code: string;
  message: string;
  file?: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  fatalIssues?: ValidationIssue[];
  components?: ComponentValidationResult[];
}

export interface PluginValidators {
  plugin: ValidateFunction;
  mcp: ValidateFunction;
  meta: ValidateFunction;
  compatibility: ValidateFunction;
  capability: ValidateFunction;
}

const ALLOWED_PORTABLE_NAMES = new Set(["plugin.json", "skills", "mcp.json"]);
const REVERSE_DOMAIN_RE = /^[a-z][a-z0-9-]*(\.[a-z0-9-]+)+$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const SKILL_NAME_RE = /^(?!.*--)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function loadPluginValidators(repoRoot = REPO_ROOT): PluginValidators {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const pluginSchema = readJson(path.join(repoRoot, "schemas/plugin.schema.json")) as Record<string, unknown>;
  const mcpSchema = readJson(path.join(repoRoot, "schemas/mcp.schema.json")) as Record<string, unknown>;
  const metaSchema = readJson(path.join(repoRoot, "schemas/internal/meta.schema.json")) as Record<string, unknown>;
  const compatibilitySchema = readJson(path.join(repoRoot, "schemas/internal/compatibility.schema.json")) as Record<string, unknown>;
  const capabilitySchema = readJson(path.join(repoRoot, "schemas/internal/capability.schema.json")) as Record<string, unknown>;

  if (pluginSchema.$id !== "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json") {
    throw new Error("Pinned plugin.schema.json $id mismatch");
  }
  if (mcpSchema.$id !== "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json") {
    throw new Error("Pinned mcp.schema.json $id mismatch");
  }

  return {
    plugin: ajv.compile(pluginSchema),
    mcp: ajv.compile(mcpSchema),
    meta: ajv.compile(metaSchema),
    compatibility: ajv.compile(compatibilitySchema),
    capability: ajv.compile(capabilitySchema),
  };
}

function parseFrontmatter(content: string): { meta: Record<string, string>; bodyLines: number } | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return null;
  const rawYaml = match[1] ?? "";
  const body = match[2] ?? "";
  const meta: Record<string, string> = {};
  for (const line of rawYaml.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (kv && kv[1] && kv[2]) {
      meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return { meta, bodyLines: body === "" ? 0 : body.split(/\r?\n/).length };
}

function validateSkillMd(skillMdPath: string, dirName: string, issues: ValidationIssue[]): void {
  const raw = fs.readFileSync(skillMdPath, "utf8");
  const parsed = parseFrontmatter(raw);
  if (!parsed) {
    issues.push({
      code: "SKILL_FRONTMATTER_MISSING",
      message: "SKILL.md must start with YAML frontmatter delimited by ---",
      file: skillMdPath,
    });
    return;
  }

  const { meta, bodyLines } = parsed;
  const name = meta.name ?? "";
  if (!name || name.length > 64 || !SKILL_NAME_RE.test(name)) {
    issues.push({
      code: "SKILL_NAME_INVALID",
      message: `Skill name must be 1-64 lowercase alphanumeric/single-hyphen chars: "${name}"`,
      file: skillMdPath,
    });
  } else if (name !== dirName) {
    issues.push({
      code: "SKILL_NAME_MISMATCH",
      message: `Skill frontmatter name "${name}" does not match parent directory "${dirName}"`,
      file: skillMdPath,
    });
  }

  const description = meta.description ?? "";
  if (description.length < 1 || description.length > 1024) {
    issues.push({
      code: "SKILL_DESCRIPTION_INVALID",
      message: `Skill description must be 1-1024 chars (got ${description.length})`,
      file: skillMdPath,
    });
  }

  if (meta.compatibility && meta.compatibility.length > 500) {
    issues.push({
      code: "SKILL_COMPATIBILITY_TOO_LONG",
      message: `Skill compatibility must be <= 500 chars (got ${meta.compatibility.length})`,
      file: skillMdPath,
    });
  }

  if (bodyLines >= 500) {
    issues.push({
      code: "SKILL_BODY_TOO_LONG",
      message: `SKILL.md body should be < 500 lines (got ${bodyLines})`,
      file: skillMdPath,
    });
  }
}

export function isSuspiciousPathString(raw: string): boolean {
  const decoded = decodeURIComponentSafe(raw);
  if (
    raw.includes("..") ||
    decoded.includes("..") ||
    path.isAbsolute(raw) ||
    path.isAbsolute(decoded) ||
    /^[a-zA-Z]:[\\/]/.test(raw) ||
    raw.startsWith("\\\\")
  ) {
    return true;
  }
  return false;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isInsideRoot(resolvedTarget: string, resolvedRoot: string): boolean {
  const rel = path.relative(resolvedRoot, resolvedTarget);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function checkDirectoryContainment(rootDir: string, issues: ValidationIssue[], label = "root"): void {
  if (!fs.existsSync(rootDir)) return;
  const resolvedRoot = fs.realpathSync(rootDir);

  const walk = (currentDir: string): void => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      let resolved: string;
      try {
        resolved = fs.realpathSync(fullPath);
      } catch (err) {
        issues.push({
          code: "CONTAINMENT_UNRESOLVABLE",
          message: `Unresolvable path or broken symlink in ${label}: ${fullPath} (${String(err)})`,
          file: fullPath,
        });
        continue;
      }

      if (!isInsideRoot(resolved, resolvedRoot)) {
        issues.push({
          code: "CONTAINMENT_ESCAPE",
          message: `Path escapes ${label} (${resolvedRoot}): ${fullPath} -> ${resolved}`,
          file: fullPath,
        });
        continue;
      }

      const stat = fs.lstatSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      }
    }
  };

  walk(rootDir);
}

export function validatePluginDir(pluginDir: string, validators: PluginValidators): ValidationResult {
  const fatalIssues: ValidationIssue[] = [];
  const components: ComponentValidationResult[] = [];
  let pluginName = path.basename(pluginDir);

  if (!fs.existsSync(pluginDir) || !fs.statSync(pluginDir).isDirectory()) {
    const issue: ValidationIssue = {
      code: "PLUGIN_DIR_MISSING",
      message: `Plugin directory does not exist: ${pluginDir}`,
      file: pluginDir,
    };
    return { ok: false, issues: [issue], fatalIssues: [issue], components: [] };
  }

  // 1. Containment check and secrets scan on authoring root
  checkDirectoryContainment(pluginDir, fatalIssues, "plugin root");
  fatalIssues.push(...scanDirectoryForSecrets(pluginDir));

  const portableRoot = path.join(pluginDir, "agent-plugin");
  if (!fs.existsSync(portableRoot) || !fs.statSync(portableRoot).isDirectory()) {
    fatalIssues.push({
      code: "PORTABLE_ROOT_MISSING",
      message: "Missing required agent-plugin/ portable package root",
      file: portableRoot,
    });
  } else {
    checkDirectoryContainment(portableRoot, fatalIssues, "agent-plugin/");

    // 2. Allowed top-level entries inside agent-plugin/
    const topEntries = fs.readdirSync(portableRoot, { withFileTypes: true });
    for (const entry of topEntries) {
      if (ALLOWED_PORTABLE_NAMES.has(entry.name)) continue;
      if (entry.isDirectory() && REVERSE_DOMAIN_RE.test(entry.name)) continue;
      fatalIssues.push({
        code: "PORTABLE_ROOT_DISALLOWED_ENTRY",
        message: `Disallowed top-level entry in agent-plugin/: ${entry.name}`,
        file: path.join(portableRoot, entry.name),
      });
    }

    // 3. plugin.json validation
    const pluginJsonPath = path.join(portableRoot, "plugin.json");
    if (!fs.existsSync(pluginJsonPath)) {
      fatalIssues.push({
        code: "PLUGIN_MANIFEST_MISSING",
        message: "Missing required agent-plugin/plugin.json",
        file: pluginJsonPath,
      });
    } else {
      try {
        const pluginJson = readJson(pluginJsonPath) as Record<string, unknown>;
        if (typeof pluginJson.name === "string" && pluginJson.name.length > 0) {
          pluginName = pluginJson.name;
        }
        if (!validators.plugin(pluginJson)) {
          for (const err of validators.plugin.errors ?? []) {
            fatalIssues.push({
              code: "PLUGIN_SCHEMA_INVALID",
              message: `plugin.json ${err.instancePath || "/"}: ${err.message ?? "schema error"}`,
              file: pluginJsonPath,
            });
          }
        }
        if (typeof pluginJson.version === "string" && !SEMVER_RE.test(pluginJson.version)) {
          fatalIssues.push({
            code: "PLUGIN_VERSION_NOT_SEMVER",
            message: `plugin.json version must be SemVer: ${pluginJson.version}`,
            file: pluginJsonPath,
          });
        }
      } catch (err) {
        fatalIssues.push({
          code: "PLUGIN_JSON_PARSE_ERROR",
          message: `Failed to parse plugin.json: ${String(err)}`,
          file: pluginJsonPath,
        });
      }
    }

    // 4. mcp.json validation (per-server isolation; invalid MCP does not invalidate independent skills)
    const mcpJsonPath = path.join(portableRoot, "mcp.json");
    if (fs.existsSync(mcpJsonPath)) {
      const { fileIssues, serverResults } = validateMcpFile(
        pluginName,
        mcpJsonPath,
        portableRoot,
        validators.mcp,
      );
      if (fileIssues.length > 0) {
        components.push({
          componentId: `${pluginName}:mcp-server:*`,
          type: "mcp-server",
          ok: false,
          issues: fileIssues,
        });
      }
      components.push(...serverResults);
    }

    // 5. Agent Skills validation (per-skill isolation)
    const skillsDir = path.join(portableRoot, "skills");
    if (fs.existsSync(skillsDir) && fs.statSync(skillsDir).isDirectory()) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        const skillDir = path.join(skillsDir, entry.name);
        const skillMdPath = path.join(skillDir, "SKILL.md");
        const skillIssues: ValidationIssue[] = [];
        if (!fs.existsSync(skillMdPath)) {
          skillIssues.push({
            code: "SKILL_MD_MISSING",
            message: `Skill directory missing SKILL.md: ${entry.name}`,
            file: skillDir,
          });
        } else {
          validateSkillMd(skillMdPath, entry.name, skillIssues);
        }
        components.push({
          componentId: `${pluginName}:skill:${entry.name}`,
          type: "skill",
          ok: skillIssues.length === 0,
          issues: skillIssues,
        });
      }
    }
  }

  // 6. meta.json validation
  const metaJsonPath = path.join(pluginDir, "meta.json");
  if (!fs.existsSync(metaJsonPath)) {
    fatalIssues.push({
      code: "META_MANIFEST_MISSING",
      message: "Missing required meta.json at authoring root",
      file: metaJsonPath,
    });
  } else {
    try {
      const metaJson = readJson(metaJsonPath) as { components?: Array<{ source?: string }> };
      if (!validators.meta(metaJson)) {
        for (const err of validators.meta.errors ?? []) {
          fatalIssues.push({
            code: "META_SCHEMA_INVALID",
            message: `meta.json ${err.instancePath || "/"}: ${err.message ?? "schema error"}`,
            file: metaJsonPath,
          });
        }
      }
      for (const comp of metaJson.components ?? []) {
        if (typeof comp.source === "string" && isSuspiciousPathString(comp.source)) {
          fatalIssues.push({
            code: "META_SOURCE_PATH_ESCAPE",
            message: `meta.json component source contains disallowed path traversal: ${comp.source}`,
            file: metaJsonPath,
          });
        }
      }
    } catch (err) {
      fatalIssues.push({
        code: "META_JSON_PARSE_ERROR",
        message: `Failed to parse meta.json: ${String(err)}`,
        file: metaJsonPath,
      });
    }
  }

  const allIssues = [...fatalIssues, ...components.flatMap((c) => c.issues)];
  return {
    ok: allIssues.length === 0,
    issues: allIssues,
    fatalIssues,
    components,
  };
}

function runCli(): void {
  const validators = loadPluginValidators(REPO_ROOT);
  const fixturesRoot = path.join(REPO_ROOT, "tests/fixtures/validation");
  const validFixture = path.join(fixturesRoot, "valid-minimal");
  const validResult = validatePluginDir(validFixture, validators);
  if (!validResult.ok) {
    console.error("Plugin validation gate FAILED on valid-minimal fixture:", validResult.issues);
    process.exit(1);
  }

  const invalidFixtures = [
    "invalid-empty",
    "invalid-plugin-unknown-key",
    "invalid-mcp-reserved-env",
    "invalid-disallowed-entry",
    "invalid-path-escape",
  ];

  for (const name of invalidFixtures) {
    const res = validatePluginDir(path.join(fixturesRoot, name), validators);
    if (res.ok) {
      console.error(`Plugin validation gate FAILED: expected ${name} to fail closed, but it passed.`);
      process.exit(1);
    }
  }

  const pluginsDir = path.join(REPO_ROOT, "plugins");
  if (fs.existsSync(pluginsDir)) {
    for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const res = validatePluginDir(path.join(pluginsDir, entry.name), validators);
      if (!res.ok) {
        console.error(`Plugin validation gate FAILED on plugin ${entry.name}:`, res.issues);
        process.exit(1);
      }
    }
  }

  console.log("Plugin validation gate PASSED (schemas compiled, valid & invalid fixtures verified).");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
