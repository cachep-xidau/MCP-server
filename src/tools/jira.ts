import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const JIRA_HOST = process.env.JIRA_HOST;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_TOKEN = process.env.JIRA_API_TOKEN;

export function setupJiraTool(server: McpServer) {
  server.tool(
    "get_jira_ticket",
    "Rest API Hub: Fetch Jira ticket details including summary, description, and status directly.",
    {
      ticket_id: z.string().describe("The exact Jira Issue Key (e.g., AIA-123)"),
    },
    async ({ ticket_id }) => {
      if (!JIRA_HOST || !JIRA_EMAIL || !JIRA_TOKEN) {
        return { content: [{ type: "text", text: "Error: Missing Jira Auth in .env" }] };
      }

      try {
        const authHeader = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_TOKEN}`).toString("base64")}`;
        const url = `${JIRA_HOST.replace(/\/$/, "")}/rest/api/3/issue/${ticket_id}`;

        const response = await fetch(url, {
          headers: { Authorization: authHeader, Accept: "application/json" },
        });

        if (!response.ok) {
          return { content: [{ type: "text", text: `Jira Request Failed: ${response.statusText}` }] };
        }

        const data = await response.json();
        const extracted = {
          key: data.key,
          summary: data.fields?.summary,
          status: data.fields?.status?.name,
          description: data.fields?.description, // ADF format
        };

        return { content: [{ type: "text", text: JSON.stringify(extracted, null, 2) }] };
      } catch (error: any) {
        return { content: [{ type: "text", text: `Jira Tool Exception: ${error.message}` }] };
      }
    }
  );
}
