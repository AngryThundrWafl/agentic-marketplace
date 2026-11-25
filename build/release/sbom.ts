import fs from "node:fs";
import path from "node:path";
import { hashDirectory, type ContentHashManifest } from "../emit/manifest.ts";

export interface CycloneDxBom {
  bomFormat: "CycloneDX";
  specVersion: "1.6";
  version: number;
  metadata: {
    component: {
      type: "application";
      name: string;
      version: string;
    };
  };
  components: Array<{
    type: "file";
    name: string;
    hashes: Array<{ alg: "SHA-256"; content: string }>;
  }>;
}

export function generateCycloneDxSbom(
  outputDir: string,
  manifest: ContentHashManifest,
): string {
  const bom: CycloneDxBom = {
    bomFormat: "CycloneDX",
    specVersion: "1.6",
    version: 1,
    metadata: {
      component: {
        type: "application",
        name: `${manifest.plugin}-${manifest.target}`,
        version: manifest.version,
      },
    },
    components: Object.entries(manifest.outputs)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, sha256]) => ({
        type: "file",
        name: file,
        hashes: [{ alg: "SHA-256", content: sha256 }],
      })),
  };

  const bomPath = path.join(outputDir, "bom.cdx.json");
  fs.writeFileSync(bomPath, `${JSON.stringify(bom, null, 2)}\n`);
  return bomPath;
}

export function writeReleaseBundle(
  outputDir: string,
  manifest: ContentHashManifest,
  lockfileHash: string,
): { bomPath: string; checksumsPath: string; provenancePath: string } {
  const bomPath = generateCycloneDxSbom(outputDir, manifest);
  const allHashes = hashDirectory(outputDir, new Set(["SHA256SUMS", "provenance.json"]));
  const checksumLines = Object.entries(allHashes)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([file, hash]) => `${hash}  ${file}`);
  const checksumsPath = path.join(outputDir, "SHA256SUMS");
  fs.writeFileSync(checksumsPath, `${checksumLines.join("\n")}\n`);

  const provenance = {
    plugin: manifest.plugin,
    version: manifest.version,
    target: manifest.target,
    adapterVersion: manifest.adapterVersion,
    capabilityRegistryVersion: manifest.capabilityRegistryVersion,
    lockfileSha256: lockfileHash,
    sbomFormat: "CycloneDX 1.6 JSON",
    signing: {
      mechanism: "sigstore-cosign-keyless-oidc",
      verifyCommand: "cosign verify-blob --bundle SHA256SUMS.bundle SHA256SUMS",
    },
    artifacts: allHashes,
  };
  const provenancePath = path.join(outputDir, "provenance.json");
  fs.writeFileSync(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);

  return { bomPath, checksumsPath, provenancePath };
}
