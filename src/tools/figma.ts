import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const FIGMA_API_KEY = process.env.API_KEY_FIGMA;

export function setupFigmaTool(server: McpServer) {
  server.tool(
    "get_figma_nodes",
    "Rest API Hub: Fetch Figma file components, nodes, and design tokens directly.",
    {
      file_key: z.string().describe("The alphanumeric ID of the Figma file, found in the URL."),
      node_ids: z.string().optional().describe("Comma separated list of node IDs to isolate in the response."),
    },
    async ({ file_key, node_ids }) => {
      if (!FIGMA_API_KEY) {
        return { content: [{ type: "text", text: "Error: API_KEY_FIGMA not found in .env" }] };
      }

      try {
        let url = `https://api.figma.com/v1/files/${file_key}`;
        if (node_ids) url += `/nodes?ids=${node_ids}`;

        const response = await fetch(url, {
          headers: { "X-Figma-Token": FIGMA_API_KEY },
        });

        if (!response.ok) {
          return { content: [{ type: "text", text: `Figma Request Failed: ${response.statusText}` }] };
        }

        const data = await response.json();
        
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(data, null, 2).substring(0, 8000) + "\n...[TRUNCATED TO PREVENT TOKEN BLOAT]",
            },
          ],
        };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Figma Tool Exception: ${error.message}` }] };
      }
    }
  );
}
