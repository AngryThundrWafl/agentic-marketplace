import fs from "node:fs";
import path from "node:path";
import type { CompatibilityReport } from "../translate/compatibility.ts";

export interface CatalogEntryInput {
  report: CompatibilityReport;
  description: string;
  developmentOnly: boolean;
  sourcePath: string;
}

export function generateMarketplaces(entries: CatalogEntryInput[], marketplacesDir: string): void {
  fs.mkdirSync(path.join(marketplacesDir, ".claude-plugin"), { recursive: true });

  const eligible = entries.filter((e) => {
    if (e.developmentOnly) return false;
    return e.report.emitted.some((c) => c.status === "exact" || c.status === "equivalent");
  });

  const claudePlugins = eligible
    .filter((e) => e.report.target === "anthropic.claude-code.cli")
    .map((e) => ({
      name: e.report.plugin.name,
      source: e.sourcePath,
      version: e.report.plugin.version,
      description: e.description,
      compatibility: {
        emittedCount: e.report.emitted.length,
        omittedCount: e.report.omitted.length,
        securityWarnings: e.report.securityWarnings,
      },
    }));

  const claudeMarketplace = {
    name: "agentic-marketplace",
    owner: { name: "Agentic Marketplace Maintainers" },
    description: "Generated Claude Code marketplace catalog derived from compatibility.json.",
    plugins: claudePlugins,
  };

  fs.writeFileSync(
    path.join(marketplacesDir, ".claude-plugin/marketplace.json"),
    `${JSON.stringify(claudeMarketplace, null, 2)}\n`,
  );

  const unifiedCatalog = {
    schemaVersion: 1,
    generatedFrom: "compatibility.json",
    entries: eligible.map((e) => ({
      plugin: e.report.plugin.name,
      version: e.report.plugin.version,
      target: e.report.target,
      packageFormat: e.report.packageFormat,
      adapterVersion: e.report.adapterVersion,
      emitted: e.report.emitted.map((c) => ({ id: c.id, status: c.status })),
      omitted: e.report.omitted.map((c) => ({ id: c.id, optional: c.optional })),
    })),
  };

  fs.writeFileSync(
    path.join(marketplacesDir, "catalog.json"),
    `${JSON.stringify(unifiedCatalog, null, 2)}\n`,
  );
}
