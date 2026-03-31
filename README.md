# Architecture Design: Decoupled RAG MCP Server

**Date:** 2026-03-31  
**Repository:** [MCP-server](https://github.com/cachep-xidau/MCP-server.git)  
**Target Audience:** Internal Developer Team (6-10 members), BSA, Tech Leads  
**Primary Goal:** Establish a unified Local MCP hub providing integrations with Figma, Jira, Confluence, and high-speed Offline Semantic RAG querying without relying on paid AI API keys.

---

## 1. System Overview

The **Decoupled RAG MCP Server** solves the Out-of-Memory (OOM) and latency challenges of running Heavy AI Models by splitting the pipeline into two environments:
1. **VPS Ingestor (Heavy Lifting):** Runs nightly via Cronjob. Scrapes Atlassian spaces, chunks data, and generates vectors using the open-source `BAAI/bge-m3` model via 3GB Swap processing. Outputs to ChromaDB.
2. **Local MCP Server (Zero-Latency Edge):** Runs on the team member's macOS. Quickly syncs the ChromaDB delta via `rsync` and resolves RAG queries instantly using local Mac CPU/RAM.

## 2. Architecture Topology (C4 Models)

### 2.1 Context Diagram
```mermaid
graph TD
    User((Local User))
    Antigravity(Claude Desktop / Antigravity)
    RAG_System[Decoupled RAG System]
    Atlassian[(Atlassian Cloud)]
    HuggingFace[(HuggingFace Models Hub)]

    User -->|Chat / Request Analysis| Antigravity
    Antigravity -->|Invoke tools via MCP| RAG_System
    RAG_System -->|Schedule scraping| Atlassian
    RAG_System -->|Download BAAI/bge-m3| HuggingFace
```

### 2.2 Container Diagram
```mermaid
graph TB
    subgraph "VPS Environment (Ubuntu Server)"
        Cron[Cronjob Scheduler]
        Ingestor[Python Ingestor Script]
        HF_Model_VPS[HuggingFace Model]
        DB_VPS[(ChromaDB Vector Database)]
        
        Cron -->|Trigger 1:00 AM| Ingestor
        Ingestor -->|Init & Embed Text| HF_Model_VPS
        Ingestor -->|Save Vectors| DB_VPS
    end

    subgraph "Local Environment (macOS)"
        SyncAgent[macOS LaunchAgent]
        DB_Local[(ChromaDB Local Mirror)]
        MCP_Server[Python FastMCP Server]
        HF_Model_Local[HuggingFace Model]
        
        SyncAgent -->|Rsync Pull| DB_VPS
        SyncAgent -->|Update| DB_Local
        MCP_Server -->|Read Vectors| DB_Local
        MCP_Server -->|Embed User Query| HF_Model_Local
    end

    Atlassian_Ext([Atlassian API]) -->|Fetch Data| Ingestor
    LLM_Client([LLM Client]) <-->|stdio / MCP Protocol| MCP_Server
```

## 3. Request Lifecycle Sequence Diagrams

### 3.1 Data Sync & Ingestion Flow (Nightly)
```mermaid
sequenceDiagram
    autonumber
    participant Mac as Local MacOS (SyncAgent)
    participant VPS as VPS Server (Cronjob)
    participant Model as HuggingFace (bge-m3)
    participant Atlas as Atlassian (Confluence/Jira)
    
    VPS->>Atlas: Request all pages from Spaces
    Atlas-->>VPS: Return Raw HTML / JSON
    Note over VPS: Chunking: Split text into small segments
    VPS->>Model: Download Model BAAI/bge-m3
    Note over VPS: Embedding: Convert chunks to Vectors (3GB Swap)
    VPS->>VPS: Persist Vector Matrix to chroma_db/
    
    loop Every 4 Hours (Background)
        Mac->>VPS: Execute Rsync over SSH
        VPS-->>Mac: Transmit incremental changes (Delta sync)
        Mac->>Mac: Update local chroma_db directory
    end
```

### 3.2 Real-time RAG Query Flow
```mermaid
sequenceDiagram
    autonumber
    actor User as Local User
    participant AI as Antigravity (LLM)
    participant MCP as Python MCP Server
    participant LB_Model as Local Model (bge-m3)
    participant DB as Local ChromaDB
    
    User->>AI: "Search PRD for Notification Feature"
    Note over AI: Identifies Intent -> Calls Tool
    AI->>MCP: Call tool: search_agile_docs
    MCP->>LB_Model: Send query text
    LB_Model-->>MCP: Return Query Vector Matrix
    MCP->>DB: Exec Similarity Search (Cosine)
    DB-->>MCP: Return Top K related context chunks
    MCP-->>AI: Return formatted Markdown String (w/ URL)
    Note over AI: LLM synthesizes context
    AI-->>User: "Based on the documentation, the notification logic is..."
```

## 4. Repository Structure & Installation

Mã nguồn hệ thống nay đã chuyển mình qua kiến trúc Python/ChromaDB:
- `vps-ingestor/rag_pipeline.py`: Cào dữ liệu chạy trên cronjob VPS Ubuntu.
- `local-rag-mcp/server.py`: FastMCP Server giao tiếp qua Stdio.
- `local-rag-mcp/sync.sh`: LaunchAgent rsync tự động.

### Cài đặt (Installation)
1. Kéo repository về: `git clone https://github.com/cachep-xidau/MCP-server.git`
2. Tạo Virtual Environment chuẩn: `python3 -m venv venv && source venv/bin/activate`
3. Cài đặt Data Science Core: `pip install -r requirements.txt` (HuggingFace, sentence-transformers, mcp, chromadb)

### Agent Configuration (Antigravity/Cursor)
Khai báo trực tiếp môi trường venv vào `mcp_config.json`:
```json
"jira-confluence-rag": {
  "command": "/Đường/dẫn/tới/MCP-server/local-rag-mcp/venv/bin/python",
  "args": ["/Đường/dẫn/tới/MCP-server/local-rag-mcp/server.py"]
}
```
