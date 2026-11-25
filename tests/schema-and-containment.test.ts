import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadPluginValidators, validatePluginDir } from "../build/validate-plugins.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURES = path.join(REPO_ROOT, "tests/fixtures/validation");
const validators = loadPluginValidators(REPO_ROOT);

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("schemas and plugin validation", () => {
  it("accepts a valid minimal plugin fixture", () => {
    const res = validatePluginDir(path.join(FIXTURES, "valid-minimal"), validators);
    expect(res.ok).toBe(true);
    expect(res.issues).toEqual([]);
  });

  it("fails closed on an empty plugin fixture", () => {
    const res = validatePluginDir(path.join(FIXTURES, "invalid-empty"), validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "PORTABLE_ROOT_MISSING")).toBe(true);
    expect(res.issues.some((i) => i.code === "META_MANIFEST_MISSING")).toBe(true);
  });

  it("rejects unknown top-level keys in plugin.json", () => {
    const res = validatePluginDir(path.join(FIXTURES, "invalid-plugin-unknown-key"), validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "PLUGIN_SCHEMA_INVALID")).toBe(true);
  });

  it("rejects PLUGIN_ROOT and PLUGIN_DATA inside mcp.json env", () => {
    const res = validatePluginDir(path.join(FIXTURES, "invalid-mcp-reserved-env"), validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "MCP_SCHEMA_INVALID")).toBe(true);
  });

  it("rejects un-namespaced top-level directories inside agent-plugin/", () => {
    const res = validatePluginDir(path.join(FIXTURES, "invalid-disallowed-entry"), validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "PORTABLE_ROOT_DISALLOWED_ENTRY")).toBe(true);
  });

  it("rejects path traversal in meta.json and mcp.json", () => {
    const res = validatePluginDir(path.join(FIXTURES, "invalid-path-escape"), validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "META_SOURCE_PATH_ESCAPE")).toBe(true);
  });

  it("rejects symlink escaping the package root via realpathSync", () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase0-outside-"));
    const outsideFile = path.join(outsideDir, "secret.txt");
    fs.writeFileSync(outsideFile, "secret");

    const pluginDir = fs.mkdtempSync(path.join(os.tmpdir(), "phase0-plugin-"));
    tempDirs.push(outsideDir, pluginDir);

    fs.cpSync(path.join(FIXTURES, "valid-minimal"), pluginDir, { recursive: true });
    fs.symlinkSync(outsideFile, path.join(pluginDir, "agent-plugin/skills/escape-link"));

    const res = validatePluginDir(pluginDir, validators);
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "CONTAINMENT_ESCAPE")).toBe(true);
  });

  it("validates compatibility.json and capability evidence schemas", () => {
    expect(
      validators.compatibility({
        plugin: { name: "example", version: "1.0.0" },
        target: "github.copilot.cli",
        packageFormat: "agent-plugins-1.0",
        adapterVersion: "0.1.0",
        capabilityRegistryVersion: "0000000",
        provenance: { sourceCommit: "0000000", buildId: "test" },
        emitted: [{ id: "example:skill:hello", status: "exact", adapterVersion: "0.1.0" }],
        omitted: [],
        rewrittenFeatures: [],
        dependencies: [],
        nativeExtensions: [],
        unsupportedFunctionality: [],
        securityWarnings: [],
      }),
    ).toBe(true);

    expect(
      validators.capability({
        targetId: "github.copilot.cli",
        featureId: "agent-plugins-1.0",
        status: "unknown",
        mechanism: "unverified",
        documentationUrl: "https://docs.github.com/en/copilot/reference/plugin-and-marketplace-reference",
        lastVerifiedDate: "2026-11-25",
        testedRuntimeVersion: "0.0.0-unverified",
      }),
    ).toBe(true);
  });
});
