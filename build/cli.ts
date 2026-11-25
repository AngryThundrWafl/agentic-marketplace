import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ClaudeCodeCliAdapter } from "./adapters/anthropic.claude-code.cli/index.ts";
import { PiPackageAdapter } from "./adapters/earendil.pi.package/index.ts";
import { CopilotCliAdapter } from "./adapters/github.copilot.cli/index.ts";
import { AntigravityAppAdapter } from "./adapters/google.antigravity.app/index.ts";
import { OpenCodeCliAdapter } from "./adapters/opencode.opencode.cli/index.ts";
import type { HarnessAdapter } from "./adapters/types.ts";
import { loadCapabilityRegistry } from "./capabilities/registry.ts";
import type { ContentHashManifest } from "./emit/manifest.ts";
import { normalizePlugin } from "./model/normalize.ts";
import { generateMarketplaces, type CatalogEntryInput } from "./release/catalog.ts";
import { writeReleaseBundle } from "./release/sbom.ts";
import type { CompatibilityReport } from "./translate/compatibility.ts";
import { loadPluginValidators } from "./validate-plugins.ts";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runFullBuild(repoRoot = REPO_ROOT): Promise<void> {
  const validators = loadPluginValidators(repoRoot);
  const registry = loadCapabilityRegistry(repoRoot, validators.capability);
  if (registry.staleEvidence.length > 0) {
    const staleNames = registry.staleEvidence.map((e) => `${e.targetId}:${e.featureId}`).join(", ");
    throw new Error(`Stale capability evidence (> 90 days): ${staleNames}`);
  }

  const adapters = new Map<string, HarnessAdapter>([
    ["github.copilot.cli", new CopilotCliAdapter("working-tree", validators)],
    ["anthropic.claude-code.cli", new ClaudeCodeCliAdapter("working-tree", validators)],
    ["google.antigravity.app", new AntigravityAppAdapter("working-tree", validators)],
    ["opencode.opencode.cli", new OpenCodeCliAdapter("working-tree", validators)],
    ["earendil.pi.package", new PiPackageAdapter("working-tree", validators)],
  ]);

  const lockfilePath = path.join(repoRoot, "pnpm-lock.yaml");
  const lockfileHash = fs.existsSync(lockfilePath)
    ? crypto.createHash("sha256").update(fs.readFileSync(lockfilePath)).digest("hex")
    : "missing";

  const pluginsDir = path.join(repoRoot, "plugins");
  const distDir = path.join(repoRoot, "dist");
  const catalogEntries: CatalogEntryInput[] = [];

  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(pluginsDir, entry.name);
    const plugin = normalizePlugin(pluginDir, validators);

    for (const target of plugin.targets) {
      const adapter = adapters.get(target.id);
      if (!adapter) {
        throw new Error(`No adapter registered for target "${target.id}" in plugin "${plugin.name}"`);
      }

      const plan = adapter.plan(plugin, target, registry);
      if (plan.blockingFailures.length > 0) {
        throw new Error(`Translation plan failed for (${plugin.name}, ${target.id}): ${plan.blockingFailures.join("; ")}`);
      }

      const outDir = path.join(distDir, plugin.name, target.id);
      await adapter.emit(plan, pluginDir, outDir);
      const verifyRes = await adapter.verify(outDir);
      if (!verifyRes.ok) {
        throw new Error(`Verification failed for (${plugin.name}, ${target.id}): ${verifyRes.errors.join("; ")}`);
      }

      const manifest = JSON.parse(fs.readFileSync(path.join(outDir, "manifest.json"), "utf8")) as ContentHashManifest;
      writeReleaseBundle(outDir, manifest, lockfileHash);

      const report = JSON.parse(fs.readFileSync(path.join(outDir, "compatibility.json"), "utf8")) as CompatibilityReport;
      catalogEntries.push({
        report,
        description: plugin.description,
        developmentOnly: plugin.developmentOnly,
        sourcePath: `./plugins/${plugin.name}`,
      });
    }
  }

  generateMarketplaces(catalogEntries, path.join(repoRoot, "marketplaces"));
  console.log(`Build & release gate PASSED for ${catalogEntries.length} (plugin, target) artifacts.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runFullBuild().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
