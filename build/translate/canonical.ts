import fs from "node:fs";
import path from "node:path";

export function emitCanonicalForClaude(pluginDir: string, outputDir: string): string[] {
  const emitted: string[] = [];
  const mappings: Array<{ src: string; dest: string }> = [
    { src: "canonical/agents", dest: "agents" },
    { src: "canonical/commands", dest: "commands" },
    { src: "canonical/rules", dest: "rules" },
    { src: "canonical/hooks", dest: "hooks" },
  ];

  for (const m of mappings) {
    const srcPath = path.join(pluginDir, m.src);
    if (!fs.existsSync(srcPath)) continue;
    const destPath = path.join(outputDir, m.dest);
    fs.cpSync(srcPath, destPath, { recursive: true });
    emitted.push(m.dest);
  }
  return emitted;
}
