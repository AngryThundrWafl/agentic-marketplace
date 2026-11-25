import fs from "node:fs";
import path from "node:path";
import type { ValidateFunction } from "ajv";
import { parse as parseYaml } from "yaml";

export const CAPABILITY_STATUSES = [
  "native",
  "standard",
  "adapter",
  "preview",
  "experimental",
  "unsupported",
  "unknown",
] as const;

export type CapabilityStatus = (typeof CAPABILITY_STATUSES)[number];

export interface HarnessDefinition {
  id: string;
  vendor: string;
  product: string;
  surface: string;
  reverseDomainNamespace: string | null;
  documentationUrl: string;
  packageFormats: string[];
}

export interface TargetFeatureMatrix {
  agentPlugins10: CapabilityStatus;
  pluginRootExpansion: CapabilityStatus;
  agentSkills: CapabilityStatus;
  mcpStdio: CapabilityStatus;
  mcpStreamableHttp: CapabilityStatus;
  mcpSse: CapabilityStatus;
  agents: CapabilityStatus;
  commands: CapabilityStatus;
  rules: CapabilityStatus;
  hooks: CapabilityStatus;
  budgets: {
    skillDescriptionMaxChars: number;
  };
}

export interface CapabilityEvidence {
  $schema?: string;
  targetId: string;
  featureId: string;
  status: CapabilityStatus;
  mechanism: string;
  documentationUrl: string;
  lastVerifiedDate: string;
  testedRuntimeVersion: string;
  testReference?: string;
  knownLimitations?: string[];
}

export interface CapabilityRegistry {
  harnesses: HarnessDefinition[];
  features: Record<string, TargetFeatureMatrix>;
  evidence: CapabilityEvidence[];
  staleEvidence: CapabilityEvidence[];
}

const VALID_STATUS_SET = new Set<string>(CAPABILITY_STATUSES);
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export function isEvidenceStale(lastVerifiedDate: string, referenceNow = new Date()): boolean {
  const verifiedMs = Date.parse(`${lastVerifiedDate}T00:00:00Z`);
  if (Number.isNaN(verifiedMs)) return true;
  return referenceNow.getTime() - verifiedMs > NINETY_DAYS_MS;
}

export function loadCapabilityRegistry(
  repoRoot: string,
  capabilityValidator: ValidateFunction,
  referenceNow = new Date(),
): CapabilityRegistry {
  const capRoot = path.join(repoRoot, "capabilities");
  const harnessesRaw = parseYaml(fs.readFileSync(path.join(capRoot, "harnesses.yaml"), "utf8")) as {
    harnesses: HarnessDefinition[];
  };
  const featuresRaw = parseYaml(fs.readFileSync(path.join(capRoot, "features.yaml"), "utf8")) as {
    targets: Record<string, TargetFeatureMatrix>;
  };

  for (const [targetId, matrix] of Object.entries(featuresRaw.targets ?? {})) {
    for (const [key, val] of Object.entries(matrix)) {
      if (key === "budgets") continue;
      if (typeof val !== "string" || !VALID_STATUS_SET.has(val)) {
        throw new Error(`Invalid capability status "${String(val)}" for ${targetId}.${key}`);
      }
    }
  }

  const evidenceDir = path.join(capRoot, "evidence");
  const evidence: CapabilityEvidence[] = [];
  const staleEvidence: CapabilityEvidence[] = [];

  if (fs.existsSync(evidenceDir)) {
    for (const entry of fs.readdirSync(evidenceDir, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const fullPath = path.join(evidenceDir, entry.name);
      const parsed = JSON.parse(fs.readFileSync(fullPath, "utf8")) as CapabilityEvidence;
      if (!capabilityValidator(parsed)) {
        const msg = (capabilityValidator.errors ?? []).map((e) => `${e.instancePath || "/"} ${e.message}`).join("; ");
        throw new Error(`Invalid capability evidence file ${entry.name}: ${msg}`);
      }
      evidence.push(parsed);
      if (isEvidenceStale(parsed.lastVerifiedDate, referenceNow)) {
        staleEvidence.push(parsed);
      }
    }
  }

  return {
    harnesses: harnessesRaw.harnesses ?? [],
    features: featuresRaw.targets ?? {},
    evidence,
    staleEvidence,
  };
}
