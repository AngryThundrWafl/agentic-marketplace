import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runFullBuild } from "../build/cli.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

describe("full build, CycloneDX 1.6 SBOM, provenance, and marketplace catalogs", () => {
  it("builds all plugins across all declared targets, emits SBOM/provenance, and generates marketplaces/", async () => {
    await runFullBuild(REPO_ROOT);

    for (const plugin of ["dockhand-gitops", "prompt-engineering"]) {
      for (const target of ["github.copilot.cli", "anthropic.claude-code.cli", "google.antigravity.app"]) {
        const outDir = path.join(REPO_ROOT, "dist", plugin, target);
        expect(fs.existsSync(path.join(outDir, "manifest.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "compatibility.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "COMPATIBILITY.md"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "bom.cdx.json"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "SHA256SUMS"))).toBe(true);
        expect(fs.existsSync(path.join(outDir, "provenance.json"))).toBe(true);

        const bom = JSON.parse(fs.readFileSync(path.join(outDir, "bom.cdx.json"), "utf8")) as {
          bomFormat: string;
          specVersion: string;
        };
        expect(bom.bomFormat).toBe("CycloneDX");
        expect(bom.specVersion).toBe("1.6");
      }
    }

    const claudeCatalog = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "marketplaces/.claude-plugin/marketplace.json"), "utf8"),
    ) as { plugins: Array<{ name: string }> };
    expect(claudeCatalog.plugins.map((p) => p.name).sort()).toEqual(["dockhand-gitops", "prompt-engineering"]);

    const unifiedCatalog = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, "marketplaces/catalog.json"), "utf8"),
    ) as { entries: unknown[] };
    expect(unifiedCatalog.entries).toHaveLength(6);
  });
});
