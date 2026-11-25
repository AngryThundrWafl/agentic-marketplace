import fs from "node:fs";
import path from "node:path";
import type {
  ComponentProvenance,
  DependencyDeclaration,
  NormalizedComponent,
  NormalizedPlugin,
  PackageFormat,
  SecretDeclaration,
  TranslationStatus,
} from "./component.ts";
import { validatePluginDir, type PluginValidators } from "../validate-plugins.ts";

interface MetaJsonFile {
  developmentOnly?: boolean;
  targets: Array<{ id: string; minVersion?: string; packageFormat: PackageFormat }>;
  components: Array<{
    id: string;
    source: string;
    optional: boolean;
    dependencies?: DependencyDeclaration[];
    omittedFeatures?: Record<string, string[]>;
    translations: Record<string, TranslationStatus>;
  }>;
  secrets?: SecretDeclaration[];
}

function listFilesRecursive(dir: string, baseDir = dir): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursive(full, baseDir));
    } else if (entry.isFile()) {
      results.push(path.relative(baseDir, full).replace(/\\/g, "/"));
    }
  }
  return results;
}

function parseSkillSummary(skillMdPath: string): { name: string; description: string; compatibility?: string; bodyLines: number } {
  const raw = fs.readFileSync(skillMdPath, "utf8");
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  const meta: Record<string, string> = {};
  const body = match?.[2] ?? "";
  for (const line of (match?.[1] ?? "").split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.+)$/);
    if (kv && kv[1] && kv[2]) {
      meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return {
    name: meta.name ?? path.basename(path.dirname(skillMdPath)),
    description: meta.description ?? "",
    ...(meta.compatibility ? { compatibility: meta.compatibility } : {}),
    bodyLines: body === "" ? 0 : body.split(/\r?\n/).length,
  };
}

export function normalizePlugin(
  pluginDir: string,
  validators: PluginValidators,
  provenance: ComponentProvenance = {
    sourceCommit: "working-tree",
    adapterVersion: "0.1.0",
    capabilityRegistryVersion: "working-tree",
    buildId: "local",
  },
): NormalizedPlugin {
  const validation = validatePluginDir(pluginDir, validators);
  if (!validation.ok) {
    const details = validation.issues.map((i) => `${i.code}: ${i.message}`).join("; ");
    throw new Error(`Cannot normalize invalid plugin at ${pluginDir}: ${details}`);
  }

  const pluginJson = JSON.parse(
    fs.readFileSync(path.join(pluginDir, "agent-plugin/plugin.json"), "utf8"),
  ) as {
    $schema: string;
    name: string;
    version?: string;
    description?: string;
  };
  const metaJson = JSON.parse(fs.readFileSync(path.join(pluginDir, "meta.json"), "utf8")) as MetaJsonFile;

  const declaredBySource = new Map(metaJson.components.map((c) => [c.source, c]));

  // Enforce meta.json rule: every override & canonical file must be listed in meta.json
  const overrideFiles = listFilesRecursive(path.join(pluginDir, "overrides")).map((rel) => `overrides/${rel}`);
  const canonicalFiles = listFilesRecursive(path.join(pluginDir, "canonical")).map((rel) => `canonical/${rel}`);
  for (const rel of [...overrideFiles, ...canonicalFiles]) {
    if (!declaredBySource.has(rel)) {
      throw new Error(`Unlisted component in ${pluginDir}: ${rel} must be declared in meta.json`);
    }
  }

  const secretNames = (metaJson.secrets ?? []).map((s) => s.name);
  const components: NormalizedComponent[] = metaJson.components.map((comp) => {
    const parts = comp.id.split(":");
    const compType = parts[1] as NormalizedComponent["type"];
    const base = {
      id: comp.id,
      type: compType,
      source: comp.source,
      sourceFormat: comp.source.startsWith("agent-plugin/") ? "agent-plugins-1.0" : "native",
      sourceVersion: pluginJson.version ?? "0.0.0",
      dependencies: comp.dependencies ?? [],
      optional: comp.optional,
      translations: comp.translations,
      omittedFeatures: comp.omittedFeatures ?? {},
      security: {
        approvalRequired: false,
        networkRequired: secretNames.length > 0,
        filesystemAccess: "read" as const,
        secretsRequired: secretNames,
      },
      provenance,
    };

    if (compType === "skill") {
      const summary = parseSkillSummary(path.join(pluginDir, comp.source));
      return {
        ...base,
        metadata: { kind: "skill", ...summary },
      };
    }

    if (compType === "native-override") {
      const targetId = comp.source.split("/")[1] ?? "unknown";
      return {
        ...base,
        metadata: { kind: "native-override", targetId, relativePath: comp.source },
      };
    }

    if (compType === "mcp-server") {
      return {
        ...base,
        metadata: { kind: "mcp-server", serverName: parts[2] ?? "default", transport: "streamable-http" },
      };
    }

    return {
      ...base,
      metadata: { kind: compType, relativePath: comp.source },
    };
  });

  return {
    name: pluginJson.name,
    version: pluginJson.version ?? "0.0.0",
    description: pluginJson.description ?? "",
    specSchema: pluginJson.$schema,
    developmentOnly: metaJson.developmentOnly ?? false,
    targets: metaJson.targets,
    secrets: metaJson.secrets ?? [],
    components,
  };
}
