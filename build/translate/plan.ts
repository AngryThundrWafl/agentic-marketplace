import type { CapabilityRegistry } from "../capabilities/registry.ts";
import type {
  ComponentProvenance,
  NormalizedComponent,
  NormalizedPlugin,
  TargetConfig,
  TranslationStatus,
} from "../model/component.ts";

export interface PlannedComponent {
  component: NormalizedComponent;
  status: TranslationStatus;
  action: "emit" | "omit";
  reason?: string;
  omittedFeatures: string[];
  equivalenceTest?: string;
}

export interface RewrittenFeature {
  componentId: string;
  feature: string;
  from: string;
  to: string;
}

export interface TranslationPlan {
  plugin: NormalizedPlugin;
  target: TargetConfig;
  adapterVersion: string;
  capabilityRegistryVersion: string;
  provenance: ComponentProvenance;
  components: PlannedComponent[];
  rewrittenFeatures: RewrittenFeature[];
  securityWarnings: string[];
  blockingFailures: string[];
}

export function buildTranslationPlan(
  plugin: NormalizedPlugin,
  target: TargetConfig,
  registry: CapabilityRegistry,
  adapterVersion: string,
  provenance: ComponentProvenance = {
    sourceCommit: "working-tree",
    adapterVersion,
    capabilityRegistryVersion: "working-tree",
    buildId: "local",
  },
  equivalenceTests: Record<string, string> = {},
): TranslationPlan {
  const blockingFailures: string[] = [];
  const planned: PlannedComponent[] = [];
  const rewrittenFeatures: RewrittenFeature[] = [];
  const securityWarnings: string[] = [];

  const harness = registry.harnesses.find((h) => h.id === target.id);
  if (!harness) {
    blockingFailures.push(`Target "${target.id}" is not registered in capabilities/harnesses.yaml`);
  } else if (!harness.packageFormats.includes(target.packageFormat)) {
    blockingFailures.push(
      `Target "${target.id}" does not support packageFormat "${target.packageFormat}"`,
    );
  }

  for (const comp of plugin.components) {
    const status = comp.translations[target.id];
    if (!status) {
      blockingFailures.push(
        `Component "${comp.id}" has no declared translation status for target "${target.id}" in meta.json`,
      );
      continue;
    }

    if (status === "unsafe") {
      blockingFailures.push(
        `Component "${comp.id}" has status "unsafe" for target "${target.id}" — failing closed`,
      );
      continue;
    }

    if (status === "unsupported") {
      if (!comp.optional) {
        blockingFailures.push(
          `Required component "${comp.id}" is "unsupported" on target "${target.id}"`,
        );
        continue;
      }
      planned.push({
        component: comp,
        status,
        action: "omit",
        reason: `Unsupported on ${target.id} (optional component omitted)`,
        omittedFeatures: [],
      });
      continue;
    }

    const omittedFeatures = comp.omittedFeatures[target.id] ?? [];
    if (status === "partial" && omittedFeatures.length === 0) {
      blockingFailures.push(
        `Component "${comp.id}" is "partial" on "${target.id}" but meta.json does not name omittedFeatures`,
      );
      continue;
    }

    const eqTest = equivalenceTests[comp.id];
    if (status === "equivalent" && !eqTest) {
      blockingFailures.push(
        `Component "${comp.id}" is "equivalent" on "${target.id}" but no named equivalence test was provided`,
      );
      continue;
    }

    planned.push({
      component: comp,
      status,
      action: "emit",
      omittedFeatures,
      ...(eqTest ? { equivalenceTest: eqTest } : {}),
    });
  }

  if (plugin.secrets.length > 0) {
    const names = plugin.secrets.map((s) => `${s.name} (${s.provisioning})`).join(", ");
    securityWarnings.push(`Plugin requires external secrets/config: ${names}`);
  }

  if (target.id === "anthropic.claude-code.cli" && plugin.components.some((c) => c.type === "mcp-server" || c.source.endsWith(".mcp.json"))) {
    securityWarnings.push("Claude Code MCP servers and hooks execute outside the sandbox.");
  }

  return {
    plugin,
    target,
    adapterVersion,
    capabilityRegistryVersion: provenance.capabilityRegistryVersion,
    provenance,
    components: planned,
    rewrittenFeatures,
    securityWarnings,
    blockingFailures,
  };
}
