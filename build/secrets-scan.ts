import fs from "node:fs";
import path from "node:path";
import type { ValidationIssue } from "./validate-plugins.ts";

interface SecretRule {
  name: string;
  pattern: RegExp;
}

const SECRET_RULES: SecretRule[] = [
  {
    name: "private-key-pem",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/,
  },
  {
    name: "github-token",
    pattern: /\b(?:gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{20,})\b/,
  },
  {
    name: "aws-access-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: "vendor-api-key",
    pattern: /\b(?:sk-ant-[A-Za-z0-9_-]{20,}|sk-proj-[A-Za-z0-9_-]{20,}|sk-live-[A-Za-z0-9_-]{20,})\b/,
  },
  {
    name: "slack-token",
    pattern: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/,
  },
  {
    name: "hardcoded-bearer-token",
    pattern: /Bearer\s+(?!\$\{)(?!<)(?!EXAMPLE)(?!PLACEHOLDER)(?!REDACTED)[A-Za-z0-9._-]{20,}/,
  },
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist"]);
const BINARY_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".ico", ".woff", ".woff2", ".zip", ".tar", ".gz"]);

export function scanDirectoryForSecrets(rootDir: string): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!fs.existsSync(rootDir)) return issues;

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (BINARY_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;

      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split(/\r?\n/);
      for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx] ?? "";
        for (const rule of SECRET_RULES) {
          if (rule.pattern.test(line)) {
            issues.push({
              code: "SECRET_DETECTED",
              message: `Potential secret (${rule.name}) detected at line ${idx + 1}`,
              file: fullPath,
            });
          }
        }
      }
    }
  };

  walk(rootDir);
  return issues;
}
