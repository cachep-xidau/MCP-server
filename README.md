# Architecture Design: DON Workspace MCP Server

**Date:** 2026-03-23
**Repository:** [MCP-server](https://github.com/cachep-xidau/MCP-server.git)
**Target Audience:** Internal Developer Team (6-10 members), BSA, Tech Leads
**Primary Goal:** Establish a unified Local MCP hub providing integrations with Figma, Jira, Confluence, and high-speed Offline RAG querying.

---

## 1. System Overview

The **DON Workspace MCP Server** operates entirely on the "Local-First" methodology (Zero-Latency, YAGNI, KISS). Instead of establishing a vulnerable and latency-heavy remote server for AI Tool queries, the MCP Server is deployed locally on every team member's workspace (Laptop/PC) using the **`stdio` communication protocol**.

When an AI Agent (Gemini in Antigravity, local Codex CLI, etc.) requires context or external actions, it spawns this MCP Server locally.

## 2. Architecture Topology

The diagram below illustrates the complete execution environment, the background synchronization mechanism for the Knowledge Base, and the external API connections.

```mermaid
flowchart TD
    classDef hub fill:#2d3436,stroke:#74b9ff,stroke-width:2px,color:#dfe6e9;
    classDef local fill:#0984e3,stroke:#74b9ff,stroke-width:2px,color:#fff;
    classDef server fill:#d63031,stroke:#fab1a0,stroke-width:2px,color:#fff;
    classDef db fill:#e17055,stroke:#ffeaa7,stroke-width:2px,color:#fff;
    classDef external fill:#00b894,stroke:#55efc4,stroke-width:2px,color:#fff;

    subgraph Internal_Network["👨‍💻 Employee Workspace (Local Machine)"]
        direction TB
        Agent["🤖 AI Agent\n(Gemini 3.1 / Codex 5.4)"]:::local
        
        subgraph MCP_Architecture["DON MCP Server (Node.js / Python)"]
            Router["🔌 MCP Core Router\n(Stdio Protocol)"]:::hub
            T_Search["🔍 Company KB\n(FTS5 RAG Tool)"]:::hub
            T_Figma["🎨 Figma MCP\n(Automation & Extract)"]:::hub
            T_Jira["🎫 Jira MCP\n(Read/Write Tickets)"]:::hub
            T_Conf["📘 Confluence MCP\n(Scrape Docs)"]:::hub
            
            Router --> T_Search
            Router --> T_Figma
            Router --> T_Jira
            Router --> T_Conf
        end

        DB_Local[("💽 Local RAG DB\n(remote-rag.db)")]:::db
        CronJob(("🔄 Background\nSync Daemon")):::local

        %% Agent triggers local MCP
        Agent == "Spawn & Query\n(stdio)" === Router
        T_Search -- "SQL MATCH\n(BM25)" --> DB_Local
        
        %% Local Sync Logic
        CronJob -. "Overwrites/Merges" .-> DB_Local
    end

    subgraph Cloud_Server["☁️ DON Architecture Server"]
        DB_Master[("💽 Master remote-rag.db\n(Single Source of Truth)")]:::server
        API_Gateway["🌐 Sync API Gateway"]:::server
        
        API_Gateway --> DB_Master
    end

    subgraph Third_Party["🌍 External Platforms"]
        S_Figma["Figma Server"]:::external
        S_Jira["Atlassian Jira"]:::external
        S_Conf["Atlassian Confluence"]:::external
    end

    %% Cross-boundary connections
    CronJob == "Polls every X mins\n(HTTP/SSH)" === API_Gateway
    T_Figma -- "REST / Auth" --> S_Figma
    T_Jira -- "REST / Auth" --> S_Jira
    T_Conf -- "REST / Auth" --> S_Conf
```

---

## 3. Core Components Breakdown

### 3.1. Local AI Agent & Stdio Protocol
The AI Agent initiates the standard Model Context Protocol via standard input/output (`stdio`). 
- **Ram Usage:** Extremely lightweight. Booting the Node.js/Python MCP process temporarily consumes only ~50-120MB memory. Process dies gracefully when the AI session ends.
- **Latency:** Execution time is limited purely by local CPU processing power. Network latency for establishing a tool connection is exactly `0ms`.

### 3.2. RAG Tool (FTS5-BM25 SQLite)
The primary Search Tool used by the `DON MCP Server`.
- Performs **Query Expansion** and applies `trigram`/`porter` tokenizers alongside FTS5.
- Uses the `snippet()` function to retrieve small contextual paragraphs rather than whole documents.
- Retrieves text exclusively from the local `remote-rag.db` replica, ensuring massive queries will not spam the central server or incur delay.

### 3.3. Remote Data Sync (Background Daemon)
For 10 simultaneous projects with constant internal spec updates, forcing the MCP to pull standard queries across the network is anti-pattern.
- A small background job (Cron/Script) continuously pulls the authoritative `remote-rag.db` from the **DON Architecture Server** to the `~/Company` workspace.
- **SQLite Advantage:** Reading the DB file doesn't block background pulling/replacing if orchestrated via WAL mode (Write-Ahead Logging). 

### 3.4. Multi-Service Integrations
Aside from RAG queries, the server acts as an aggregation point (Facade Pattern) for specialized automation:
- **Jira MCP:** Create Epics, track story points, retrieve acceptance criteria.
- **Confluence MCP:** Provide dynamic scraping when the offline RAG database doesn't hold the latest 5-minute changes.
- **Figma MCP:** Fetch design token updates, verify screen layouts against Figma nodes.

---

## 4. Implementation Steps Roadmap
1. **Initialize Project:** `npm init -y` with `@modelcontextprotocol/sdk` inside the `MCP-server` repo.
2. **Build the Stdio Server:** Expose a basic `search_company` tool.
3. **Database Driver:** Install `better-sqlite3` locally; wire the query logic shown previously.
4. **Agent Config:** Modify `gemini.config` or `.claude/mcp.json` to point the `command` target to the compiled JavaScript/Python root file.
5. **Scale Services:** Sub-route Jira and Figma classes into the tool handler block.
