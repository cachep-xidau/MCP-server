import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function testRAG() {
  console.log("Connecting to DON MCP Server via stdio...");
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/index.ts"]
  });

  const client = new Client(
    { name: "simulated-ai-agent", version: "1.0.0" },
    { capabilities: { tools: {} } }
  );

  await client.connect(transport);
  console.log("Connected Successfully. Firing FTS5-BM25 Request...");

  const startTime = Date.now();
  
  // Call the registered Search tool
  const result = await client.callTool({
    name: "search_company_kb",
    arguments: {
      query_expansion_keywords: "architecture OR backend OR frontend",
    }
  });

  const durationStr = `${Date.now() - startTime}ms`;

  console.log("==================================================");
  console.log(`QUERY RESULTS (Latency: ${durationStr})`);
  console.log("==================================================");
  
  const content = (result.content as any[])[0]?.text;
  console.log(content);
  
  process.exit(0);
}

testRAG().catch(error => {
  console.error("Test failed:", error);
  process.exit(1);
});
