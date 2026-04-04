# Decoupled RAG MCP Server: Zero-Latency Semantic Search Architecture

**Date:** March 2026  
**Repository:** [MCP-server](https://github.com/cachep-xidau/MCP-server.git)

## 1. Executive Summary

A highly optimized Model Context Protocol (MCP) server providing zero-latency Semantic RAG querying and unified integration for Figma, Jira, and Confluence. The architecture completely decouples the heavy inference ingestion pipeline from the local execution edge, delivering lightning-fast, offline context retrieval without relying on expensive, cloud-based AI API keys. 

**Key Architectural Achievements:**
- Solved Out-of-Memory (OOM) and latency bottlenecks typically associated with heavy AI models.
- Designed a hybrid cloud-local topology utilizing a VPS for heavy lifting and local edge nodes for zero-latency execution.
- Established a robust Zero-Trust security network pipeline.

## 2. Architecture & Topology

The system is strategically split into two specialized environments:
1. **VPS Ingestor (Heavy Lifting):** A nightly cronjob pipeline that scrapes Atlassian data (Jira/Confluence spaces), segments the text, and produces vector embeddings using the open-source `BAAI/bge-m3` model via 3GB Swap processing. Output is stored in a centralized ChromaDB.
2. **Local Edge Server (Zero-Latency):** A local macOS-based FastMCP server that fetches differential ChromaDB updates via `rsync`. It processes RAG queries instantly using local compute resources.

### 2.1 Context Diagram
```mermaid
graph TD
    User((Local User))
    Antigravity(AI Assistant)
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

    subgraph "Local Environment (macOS Edge)"
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

## 3. Data Flow & Request Lifecycle

### 3.1 Nightly Data Sync & Ingestion Pipeline
```mermaid
sequenceDiagram
    autonumber
    participant Mac as Local Edge (SyncAgent)
    participant VPS as Cloud Ingestor (VPS)
    participant Model as HuggingFace (bge-m3)
    participant Atlas as Atlassian (DataSource)
    
    VPS->>Atlas: Request pages/issues from Spaces
    Atlas-->>VPS: Return Raw HTML / JSON Payload
    Note over VPS: Chunking & Pre-processing
    VPS->>Model: Initialize BAAI/bge-m3 Engine
    Note over VPS: Vectorization Matrix Generation
    VPS->>VPS: Persist Vectors to ChromaDB
    
    loop Background Sync (Every 4 Hours)
        Mac->>VPS: Initiate SSH Rsync
        VPS-->>Mac: Transmit incremental delta
        Mac->>Mac: Merge local ChromaDB store
    end
```

### 3.2 Real-Time Edge RAG Query
```mermaid
sequenceDiagram
    autonumber
    actor User as Local User
    participant AI as AI Agent (LLM)
    participant MCP as Python FastMCP Server
    participant LB_Model as Local Model Wrapper
    participant DB as Local ChromaDB Engine
    
    User->>AI: "Search PRD for Notification Feature"
    Note over AI: Detects Intent -> Routes via MCP
    AI->>MCP: Execute tool: search_agile_docs
    MCP->>LB_Model: Vectorize query string
    LB_Model-->>MCP: Yield Query Matrix
    MCP->>DB: Cosine Similarity Execution
    DB-->>MCP: Retrieve Top-K Context Vectors
    MCP-->>AI: Dispatch Markdown Context w/ Citations
    Note over AI: Contextual Synthesis
    AI-->>User: Synthesized response based on internal docs
```

## 4. Security & Zero-Trust Posture

System-wide security is enforced to prevent unauthorized access and to protect sensitive enterprise data during transport:
- **Tailscale Mesh VPN:** Traffic between the macOS Edge node and the VPS operates exclusively within a private, encrypted Tailscale network overlay.
- **Strict UFW Firewall Rules:** Public SSH (port 22) and all external vectors are blocked. Synchronization relies strictly on the safe `tailscale0` network interface.
- **Certificate & Key-Based Automation:** Password authentication is completely disabled on the VPS. The chronological `sync-db.sh` scripts rely on hardened `id_ed25519` keys for secure unattended sync processes.

## 5. Technical Stack

- **Core Integration:** Python 3.x, FastMCP Protocol framework.
- **AI & NLP:** HuggingFace `sentence-transformers`, `BAAI/bge-m3` Model.
- **Data Layer:** ChromaDB (Vector Search & Persistence).
- **Core Infrastructure:** Ubuntu Server, macOS, Unix Cron, macOS LaunchAgents.
- **Security & Networking:** Tailscale (VPN), Rsync over SSH, UFW (Uncomplicated Firewall).

## 6. Architecture Modularity

The repository cleanly delineates the cloud ingestion mechanisms from the local execution service:
- `vps-ingestor/rag_pipeline.py`: Heavy-lifting module handling scheduled data extraction and computationally intensive vectorization.
- `local-rag-mcp/server.py`: Low-footprint FastMCP listener and similarity execution block.
- `local-rag-mcp/sync.sh`: LaunchAgent executable automating differential replication without user intervention.

### Configuration Injection
```json
"jira-confluence-rag": {
  "command": "/path/to/MCP-server/local-rag-mcp/venv/bin/python",
  "args": ["/path/to/MCP-server/local-rag-mcp/server.py"]
}
```

---
*Developed as a technical showcase for advanced AI orchestration, context engineering, and decoupled system design.*
