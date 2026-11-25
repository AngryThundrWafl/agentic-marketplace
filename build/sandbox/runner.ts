export interface SandboxOptions {
  image?: string;
  allowNetwork?: boolean;
  cpus?: string;
  memory?: string;
  timeoutSeconds?: number;
}

export function buildSandboxDockerArgs(
  mountDir: string,
  command: string[],
  opts: SandboxOptions = {},
): string[] {
  const image = opts.image ?? "node:22-bookworm-slim";
  const cpus = opts.cpus ?? "1";
  const memory = opts.memory ?? "1g";

  const args = [
    "run",
    "--rm",
    "--read-only",
    "--tmpfs",
    "/tmp:rw,noexec,nosuid,size=64m",
    `--cpus=${cpus}`,
    `--memory=${memory}`,
    "--cap-drop=ALL",
    "--security-opt=no-new-privileges:true",
  ];

  if (!opts.allowNetwork) {
    args.push("--network=none");
  }

  args.push("-v", `${mountDir}:/workspace:ro`, "-w", "/workspace", image, ...command);
  return args;
}
