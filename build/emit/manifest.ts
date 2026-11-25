import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface ContentHashManifest {
  plugin: string;
  version: string;
  target: string;
  adapterVersion: string;
  capabilityRegistryVersion: string;
  inputs: Record<string, string>;
  outputs: Record<string, string>;
}

export function sha256Buffer(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function hashDirectory(dir: string, excludeFiles: Set<string> = new Set()): Record<string, string> {
  const result: Record<string, string> = {};
  if (!fs.existsSync(dir)) return result;

  const walk = (current: string): void => {
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      const rel = path.relative(dir, full).replace(/\\/g, "/");
      if (excludeFiles.has(rel)) continue;
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        result[rel] = sha256Buffer(fs.readFileSync(full));
      }
    }
  };

  walk(dir);
  return result;
}

export function writeContentManifest(
  outputDir: string,
  pluginDir: string,
  meta: {
    plugin: string;
    version: string;
    target: string;
    adapterVersion: string;
    capabilityRegistryVersion: string;
  },
): string {
  const inputs = hashDirectory(pluginDir, new Set(["node_modules"]));
  const outputs = hashDirectory(outputDir, new Set(["manifest.json"]));
  const manifest: ContentHashManifest = {
    ...meta,
    inputs,
    outputs,
  };
  const manifestPath = path.join(outputDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifestPath;
}
