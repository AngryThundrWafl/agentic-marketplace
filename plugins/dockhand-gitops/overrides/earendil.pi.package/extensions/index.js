/**
 * Pi coding agent extension registering the dockhand MCP server from environment variables.
 *
 * @param {import("@earendil-works/pi-coding-agent").ExtensionAPI} pi
 */
export default function dockhandGitopsExtension(pi) {
  const url = process.env.DOCKHAND_MCP_URL?.trim();
  if (!url) {
    return;
  }

  const token = process.env.DOCKHAND_MCP_AUTH_TOKEN?.trim();
  pi.registerMcpServer("dockhand", {
    url,
    ...(token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : {}),
    exposure: "direct",
    description: "Observe and validate multi-host GitOps Docker stacks via mcp-dockhand.",
  });
}
