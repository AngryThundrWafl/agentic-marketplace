import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NPM_TARGETS = ["earendil.pi.package", "opencode.opencode.cli"] as const;

export function findPublishablePackages(distRoot = path.join(REPO_ROOT, "dist")): string[] {
  if (!fs.existsSync(distRoot)) {
    throw new Error(`Missing dist directory at ${distRoot}. Run \`corepack pnpm release-gate\` first.`);
  }
  const packageDirs: string[] = [];
  for (const pluginEntry of fs.readdirSync(distRoot, { withFileTypes: true })) {
    if (!pluginEntry.isDirectory()) continue;
    for (const target of NPM_TARGETS) {
      const targetDir = path.join(distRoot, pluginEntry.name, target);
      if (fs.existsSync(path.join(targetDir, "package.json"))) {
        packageDirs.push(targetDir);
      }
    }
  }
  return packageDirs.sort();
}

export function publishNpmPackages(options: { dryRun?: boolean; distRoot?: string } = {}): void {
  const dryRun = options.dryRun ?? false;
  const packageDirs = findPublishablePackages(options.distRoot);
  if (packageDirs.length === 0) {
    throw new Error("No publishable npm packages found under dist/");
  }

  for (const dir of packageDirs) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as {
      name: string;
      version?: string;
    };
    const args = ["stage", "publish", "--access", "public", ...(dryRun ? ["--dry-run"] : [])];
    console.log(`${dryRun ? "[dry-run] " : ""}Staging ${pkg.name}@${pkg.version ?? "0.0.0"} from ${path.relative(REPO_ROOT, dir)}`);
    execFileSync("npm", args, { cwd: dir, stdio: "inherit" });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes("--dry-run");
  publishNpmPackages({ dryRun });
}
