import type { Tool } from "./index.ts";

// Registers the official GitHub MCP server, wired with GH_TOKEN. Agents use this
// to read PR comments etc. without copy-paste.
const tool: Tool = {
  id: "mcp",
  label: "GitHub MCP server",
  default: true,
  required: true,
  async run(ctx) {
    ctx.mcpServers.github = {
      url: "https://api.githubcopilot.com/mcp/",
      headers: { Authorization: "Bearer ${GH_TOKEN}" },
    };
  },
};

export default tool;
