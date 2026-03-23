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

### 2.1. Current Implementation (MVP Reality)

This diagram illustrates the **actual state** of the `MCP-server` repository codebase today. It functions as a lightweight, barebones REST wrapper that queries APIs securely but currently lacks a dedicated resilience or caching layer.

```mermaid
flowchart TD
    subgraph HostIDE["Host IDE Environment"]
        direction TB
        Agent["AI Agent\n(Gemini/Claude/Codex)"]
        Expander["Zod Schema Engine\n(Prompt-to-Keyword Expander)"]
        Agent -- "Reads Tool Description" --> Expander
    end

    subgraph MCP_Process["MCP Node.js Process (stdio)"]
        direction TB
        Router["Core Router\n(Protocol Handler)"]

        subgraph ToolsLayer["Integration Hubs (Direct Fetch)"]
            direction LR
            T_Search["FTS5 Search"]
            T_Figma["Figma Gateway"]
            T_Jira["Jira Gateway"]
        end

        Router --> ToolsLayer
    end

    LocalDB[("Local RAG DB\n(SQLite WAL)")]
    ExtAPIs["External APIs\n(Figma/Jira)"]

    Expander == "Spawn & Query\n(JSON-RPC)" === Router
    T_Search -- "SQL MATCH" --> LocalDB
    ToolsLayer -- "Direct fetch()\n(No Cache / No Retry)" --> ExtAPIs
```

### 2.2. Desired Enterprise Architecture (Target State)

This diagram outlines the **planned future state** of the system. It introduces a comprehensive `Resilience & State Layer` (Circuit Breakers, Token Bucket limiters, and Local caching) designed to prevent cascading failures and API throttling.

```mermaid
flowchart TD
    subgraph HostIDE["Host IDE Environment"]
        direction TB
        Agent["AI Agent\n(Gemini/Claude/Codex)"]
        Expander["Zod Schema Engine\n(Prompt-to-Keyword Expander)"]
        Agent -- "Reads Tool Description" --> Expander
    end

    subgraph MCP_Process["MCP Node.js Process (stdio)"]
        direction TB
        Router["Core Router\n(Protocol Handler)"]

        subgraph ResilienceLayer["Resilience & State Layer\n(TODO: Opossum, SQLite Cache)"]
            direction LR
            Breaker["Circuit Breaker"]
            Limiter["Rate Limiter"]
            Cache["Cache Manager\n(L1 + L2)"]
        end

        subgraph ToolsLayer["Integration Hubs"]
            direction LR
            T_Search["FTS5 Search"]
            T_Figma["Figma Gateway"]
            T_Jira["Jira Gateway"]
        end

        Router --> ResilienceLayer
        Breaker --> Limiter
        Limiter --> Cache
        Cache -. "Cache Miss" .-> ToolsLayer
    end

    LocalDB[("Local RAG DB\n(SQLite WAL)")]
    MasterDB[("DON Architecture Server")]
    ExtAPIs["External APIs\n(Figma/Jira)"]

    Expander == "Spawn & Query\n(JSON-RPC)" === Router
    T_Search -- "SQL MATCH" --> LocalDB
    ToolsLayer -- "HTTPS / REST" --> ExtAPIs
    MasterDB -. "Background CRON Sync" .-> LocalDB
```

### 2.3. Request Lifecycle Sequence (Planned)

This sequence diagram illustrates how a tool execution request will eventually flow through the internal resilience and caching layers, demonstrating the aggressive offline fallback strategy.

```mermaid
sequenceDiagram
    participant AGY as AI Agent (IDE)
    participant schema as Zod Schema Engine
    participant Core as MCP Core (stdio)
    participant Cache as L1/L2 Cache
    participant Res as Resilience (Breaker/Limiter)
    participant Tool as Tool (Figma/Jira)
    participant Ext as External API
    
    AGY->>schema: "Find login docs"
    schema->>schema: Parse Tool Description
    schema->>schema: Expand into "login OR auth"
    schema->>Core: Connects via stdio
    schema->>Core: CallTool(name, args)
    
    Core->>Cache: Check Response Cache (Stale-if-error)
    alt Cache HIT (Valid)
        Cache-->>Core: Return Cached Data
    else Cache MISS or STALE
        Cache->>Res: Forward Request
        
        Res->>Res: Check Rate Limits
        Res->>Res: Check Breaker Status (Open/Closed)
        
        alt Breaker OPEN
            Res-->>Cache: Reject (Fast Fail)
            Cache-->>Core: Fallback to Stale Data
        else Breaker CLOSED
            Res->>Tool: Execute Fetch
            Tool->>Ext: HTTPS Request
            
            alt Network Success
                Ext-->>Tool: 200 OK Response
                Tool-->>Cache: Save to L1/L2 (Normalize)
                Cache-->>Core: Return Fresh Data
            else Network Failure / Timeout
                Ext--xTool: 5xx / Timeout
                Tool->>Res: Record Failure
                Res->>Res: Trip Breaker (if threshold met)
                Tool-->>Cache: Retry Exhausted
                Cache-->>Core: Fallback to Stale Data (stale-if-error)
            end
        end
    end
    
    Core-->>AGY: ToolResult JSON
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

## 4. Repository Structure & Usage
Mã nguồn đã được xây dựng chuẩn theo kiến trúc trên với các thành phần chính:
- `src/index.ts`: Hub Router chính điều phối Stdio Transport.
- `src/tools/search_kb.ts`: Truy vấn FTS5-BM25 SQLite.
- `src/tools/figma.ts`, `jira.ts`, `confluence.ts`: Các Hub bọc Native REST API tới Atlassian và Figma.
- `scripts/sync-db.sh`: Bash script đồng bộ Database nền tảng.

### Cài đặt (Installation)
1. Kéo repository về: `git clone https://github.com/cachep-xidau/MCP-server.git`
2. Cài đặt thư viện: `npm install`
3. Cấu hình `.env` dựa theo document (Cần JIRA_API_TOKEN, API_KEY_FIGMA, DB_PATH).
4. Build mã nguồn: `npm run build`

### Agent Configuration (Claude Code / Gemini / Cursor)
Thêm khối cấu hình sau vào máy Local (VD: `~/.claude/.mcp.json`):
```json
"don-workspace-rag": {
  "command": "node",
  "args": ["/đường/dẫn/tới/MCP-server/build/index.js"]
}
```

### Kích hoạt Đồng bộ DB (CronJob Sync)
Bật script tự động kéo `remote-rag.db` từ Server công ty mỗi 5 phút bằng System Cron:
```bash
chmod +x scripts/sync-db.sh
(crontab -l 2>/dev/null; echo "*/5 * * * * bash $(pwd)/scripts/sync-db.sh") | crontab -
```
