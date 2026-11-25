import type { CapabilityRegistry } from "../capabilities/registry.ts";
import type { NormalizedPlugin, TargetConfig } from "../model/component.ts";
import type { TranslationPlan } from "../translate/plan.ts";

export interface EmissionResult {
  ok: boolean;
  outputDir: string;
  filesWritten: string[];
  manifestPath: string;
  compatibilityPath: string;
}

export interface VerificationResult {
  ok: boolean;
  errors: string[];
}

export interface HarnessAdapter {
  readonly id: string;
  readonly version: string;
  readonly capabilityRegistryVersion: string;

  capabilities(registry: CapabilityRegistry): Record<string, unknown>;

  plan(
    plugin: NormalizedPlugin,
    target: TargetConfig,
    registry: CapabilityRegistry,
    equivalenceTests?: Record<string, string>,
  ): TranslationPlan;

  emit(
    plan: TranslationPlan,
    pluginDir: string,
    outputDir: string,
  ): Promise<EmissionResult>;

  verify(outputDir: string): Promise<VerificationResult>;

  dryRun(plan: TranslationPlan): Promise<TranslationPlan>;
}
