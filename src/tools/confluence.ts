import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const HOST = process.env.JIRA_HOST ? process.env.JIRA_HOST.replace(/\/$/, "") + "/wiki" : "";
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;

export function setupConfluenceTool(server: McpServer) {
  server.tool(
    "search_confluence_live",
    "Rest API Hub: Live search for recent Confluence documents directly from Atlassian if the offline RAG lacks results.",
    {
      cql_query: z.string().describe("Confluence Query Language (CQL). Example: 'type = page AND title ~ \"Architecture\"'"),
    },
    async ({ cql_query }) => {
      if (!HOST || !EMAIL || !TOKEN) {
        return { content: [{ type: "text", text: "Error: Missing Confluence Auth in .env" }] };
      }

      try {
        const authHeader = `Basic ${Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64")}`;
        const url = `${HOST}/rest/api/content/search?cql=${encodeURIComponent(cql_query)}&expand=body.view`;

        const response = await fetch(url, {
          headers: { Authorization: authHeader, Accept: "application/json" },
        });

        if (!response.ok) {
          return { content: [{ type: "text", text: `Confluence Request Failed: ${response.statusText}` }] };
        }

        const data = await response.json();
        const results = (data.results || []).map((page: any) => ({
          id: page.id,
          title: page.title,
          url: HOST + page._links?.webui,
          content_snippet: page.body?.view?.value?.substring(0, 500) || "No content.",
        }));

        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Confluence Tool Exception: ${error.message}` }] };
      }
    }
  );
}
