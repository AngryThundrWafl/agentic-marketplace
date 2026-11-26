/**
 * Pi coding agent extension registering the dockhand MCP server from environment variables.
 *
 * @param {import("@earendil-works/pi-coding-agent").ExtensionAPI} pi
 */
export default function dockhandGitopsExtension(pi) {
  pi.registerMcpServer("dockhand", {
    url: "${DOCKHAND_MCP_URL}",
    headers: {
      Authorization: "Bearer ${DOCKHAND_MCP_AUTH_TOKEN}",
    },
    exposure: "direct",
    description: "Observe and validate multi-host GitOps Docker stacks via mcp-dockhand.",
  });
}
