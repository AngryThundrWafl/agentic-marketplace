import type { TranslationPlan } from "./plan.ts";

export interface CompatibilityReport {
  $schema?: string;
  plugin: {
    name: string;
    version: string;
  };
  target: string;
  packageFormat: string;
  adapterVersion: string;
  capabilityRegistryVersion: string;
  provenance: {
    sourceCommit: string;
    buildId: string;
  };
  emitted: Array<{
    id: string;
    status: "exact" | "equivalent" | "partial";
    adapterVersion: string;
    equivalenceTest?: string;
    omittedFeatures?: string[];
  }>;
  omitted: Array<{
    id: string;
    reason: string;
    optional: boolean;
  }>;
  rewrittenFeatures: Array<{
    componentId: string;
    feature: string;
    from: string;
    to: string;
  }>;
  dependencies: Array<{
    name: string;
    type: string;
    required: boolean;
    resolved: boolean;
  }>;
  nativeExtensions: Array<{
    source: string;
    version: string;
  }>;
  unsupportedFunctionality: string[];
  securityWarnings: string[];
}

export function generateCompatibilityReport(plan: TranslationPlan): CompatibilityReport {
  if (plan.blockingFailures.length > 0) {
    throw new Error(`Cannot generate compatibility report with blocking failures: ${plan.blockingFailures.join("; ")}`);
  }

  const emitted: CompatibilityReport["emitted"] = [];
  const omitted: CompatibilityReport["omitted"] = [];
  const nativeExtensions: CompatibilityReport["nativeExtensions"] = [];
  const unsupportedFunctionality: string[] = [];
  const deps: CompatibilityReport["dependencies"] = [];

  for (const item of plan.components) {
    if (item.action === "emit" && (item.status === "exact" || item.status === "equivalent" || item.status === "partial")) {
      emitted.push({
        id: item.component.id,
        status: item.status,
        adapterVersion: plan.adapterVersion,
        ...(item.equivalenceTest ? { equivalenceTest: item.equivalenceTest } : {}),
        ...(item.omittedFeatures.length > 0 ? { omittedFeatures: item.omittedFeatures } : {}),
      });
      if (item.component.type === "native-override") {
        nativeExtensions.push({
          source: item.component.source,
          version: item.component.sourceVersion,
        });
      }
      for (const om of item.omittedFeatures) {
        unsupportedFunctionality.push(`${item.component.id}: ${om}`);
      }
      for (const d of item.component.dependencies) {
        deps.push({
          name: d.name,
          type: d.type,
          required: !item.component.optional,
          resolved: true,
        });
      }
    } else if (item.action === "omit") {
      omitted.push({
        id: item.component.id,
        reason: item.reason ?? "Unsupported",
        optional: item.component.optional,
      });
      unsupportedFunctionality.push(`${item.component.id}: ${item.reason ?? "Unsupported"}`);
    }
  }

  return {
    plugin: {
      name: plan.plugin.name,
      version: plan.plugin.version,
    },
    target: plan.target.id,
    packageFormat: plan.target.packageFormat,
    adapterVersion: plan.adapterVersion,
    capabilityRegistryVersion: plan.capabilityRegistryVersion,
    provenance: {
      sourceCommit: plan.provenance.sourceCommit,
      buildId: plan.provenance.buildId,
    },
    emitted,
    omitted,
    rewrittenFeatures: plan.rewrittenFeatures,
    dependencies: deps,
    nativeExtensions,
    unsupportedFunctionality,
    securityWarnings: plan.securityWarnings,
  };
}

export function renderCompatibilityMarkdown(report: CompatibilityReport): string {
  const lines: string[] = [
    `# Compatibility Report: ${report.plugin.name} (${report.plugin.version})`,
    "",
    `- **Target:** \`${report.target}\``,
    `- **Package Format:** \`${report.packageFormat}\``,
    `- **Adapter Version:** \`${report.adapterVersion}\``,
    `- **Capability Registry:** \`${report.capabilityRegistryVersion}\``,
    "",
    "## Emitted Components",
    "",
    "| Component | Status | Adapter Version | Notes |",
    "|---|---|---|---|",
  ];

  for (const e of report.emitted) {
    const notes = [
      e.equivalenceTest ? `test: \`${e.equivalenceTest}\`` : "",
      e.omittedFeatures?.length ? `omitted: ${e.omittedFeatures.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    lines.push(`| \`${e.id}\` | \`${e.status}\` | \`${e.adapterVersion}\` | ${notes || "-"} |`);
  }

  if (report.omitted.length > 0) {
    lines.push("", "## Omitted Components", "");
    for (const o of report.omitted) {
      lines.push(`- \`${o.id}\` (optional: ${String(o.optional)}): ${o.reason}`);
    }
  }

  if (report.securityWarnings.length > 0) {
    lines.push("", "## Security Warnings", "");
    for (const w of report.securityWarnings) {
      lines.push(`- ${w}`);
    }
  }

  lines.push("");
  return lines.join("\n");
}
