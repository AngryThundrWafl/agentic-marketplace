export type ComponentType =
  | "skill"
  | "mcp-server"
  | "agent"
  | "command"
  | "rule"
  | "hook"
  | "native-override";

export type TranslationStatus =
  | "exact"
  | "equivalent"
  | "partial"
  | "unsupported"
  | "unsafe";

export type PackageFormat =
  | "agent-plugins-1.0"
  | "claude-native"
  | "cursor-native"
  | "codex-native"
  | "antigravity-native"
  | "opencode-native"
  | "pi-package";

export interface DependencyDeclaration {
  type: "runtime" | "tool" | "mcp-server" | "plugin" | "component";
  name: string;
  versionConstraint?: string;
}

export interface SecurityRequirements {
  toolsAllowed?: string[];
  approvalRequired: boolean;
  networkRequired: boolean;
  filesystemAccess: "none" | "read" | "write";
  secretsRequired: string[];
}

export interface ComponentProvenance {
  sourceCommit: string;
  adapterVersion: string;
  capabilityRegistryVersion: string;
  buildId: string;
}

export interface SkillMetadata {
  kind: "skill";
  name: string;
  description: string;
  compatibility?: string;
  bodyLines: number;
}

export interface McpServerMetadata {
  kind: "mcp-server";
  serverName: string;
  transport: "stdio" | "streamable-http" | "sse";
}

export interface NativeOverrideMetadata {
  kind: "native-override";
  targetId: string;
  relativePath: string;
}

export interface CanonicalComponentMetadata {
  kind: "agent" | "command" | "rule" | "hook";
  relativePath: string;
}

export type TypedComponentMetadata =
  | SkillMetadata
  | McpServerMetadata
  | NativeOverrideMetadata
  | CanonicalComponentMetadata;

export interface NormalizedComponent {
  id: string;
  type: ComponentType;
  source: string;
  sourceFormat: string;
  sourceVersion: string;
  dependencies: DependencyDeclaration[];
  optional: boolean;
  translations: Record<string, TranslationStatus>;
  omittedFeatures: Record<string, string[]>;
  security: SecurityRequirements;
  metadata: TypedComponentMetadata;
  provenance: ComponentProvenance;
}

export interface TargetConfig {
  id: string;
  minVersion?: string;
  packageFormat: PackageFormat;
}

export interface SecretDeclaration {
  name: string;
  required: boolean;
  provisioning: "target-secret-store" | "env" | "oauth" | "interactive";
  server?: string;
}

export interface NormalizedPlugin {
  name: string;
  version: string;
  description: string;
  specSchema: string;
  developmentOnly: boolean;
  targets: TargetConfig[];
  secrets: SecretDeclaration[];
  components: NormalizedComponent[];
}
