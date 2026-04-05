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

## 4. Technical Stack, Modularity & Security

The system is built on a modern AI stack and is organized to cleanly delineate heavy cloud ingestion mechanisms from the local execution service, with security engineered at every layer.

### 4.1 System Modularity
- **`vps-ingestor/rag_pipeline.py` (Heavy-Lifting):** Handles scheduled data extraction and computationally intensive vectorization on the VPS.
- **`local-rag-mcp/server.py` (Local Execution):** Low-footprint FastMCP listener and similarity execution block on the macOS edge.
- **`local-rag-mcp/sync.sh` (Automation):** LaunchAgent executable automating differential replication without user intervention.

#### Configuration Injection
```json
"jira-confluence-rag": {
  "command": "/path/to/MCP-server/local-rag-mcp/venv/bin/python",
  "args": ["/path/to/MCP-server/local-rag-mcp/server.py"]
}
```

### 4.2 Technical Stack
- **Core & AI:** Python 3.x, FastMCP Protocol, HuggingFace (`sentence-transformers`, `BAAI/bge-m3`), ChromaDB.
- **Infrastructure:** Ubuntu Server, macOS, Unix Cron, macOS LaunchAgents.
- **Security & Networking:** Tailscale (VPN), Rsync over SSH, UFW (Uncomplicated Firewall).

### 4.3 Zero-Trust Security Posture
System-wide security prevents unauthorized access and protects sensitive enterprise data during transport:
- **Tailscale Mesh VPN:** Traffic operates exclusively within a private, encrypted overlay network between the VPS and edge node.
- **Strict UFW Firewall:** Public SSH (port 22) and external vectors are blocked; synchronization relies solely on the safe `tailscale0` interface.
- **Certificate-Based Automation:** Password authentication is completely disabled on the VPS. Unattended `sync-db.sh` processes use hardened `id_ed25519` keys.

---
*Developed as a technical showcase for advanced AI orchestration, context engineering, and decoupled system design.*

## 5. AI Coworker (DON BSA Gates Timeline)

```mermaid
flowchart TD
    classDef gate fill:#e1f5fe,stroke:#03a9f4,stroke-width:2px,color:#01579b,font-weight:bold
    classDef cmd fill:#e8f5e9,stroke:#4caf50,stroke-width:1px,color:#2e7d32
    classDef proof fill:#ffebee,stroke:#f44336,stroke-width:1px,color:#c62828
    classDef owner fill:#fff8e1,stroke:#ffc107,stroke-width:1px,color:#f57f17
    classDef note fill:#fbe9e7,stroke:#ff8a65,stroke-width:1px,stroke-dasharray: 5 5,color:#bf360c

    subgraph "DON BSA Gates Timeline"
        G1["GATE 01<br>BRAINSTORMED"]:::gate
        G2["GATE 02<br>ELICITED"]:::gate
        G3["GATE 03<br>PRD_READY"]:::gate
        G4["GATE 04<br>BROKEN_DOWN"]:::gate
        G5["GATE 05<br>DESIGNED"]:::gate
        G6["GATE 06<br>DESIGN_VERIFIED"]:::gate

        G1 --> G2
        G2 --> G3
        G3 --> G4
        G4 --> G5
        G5 --> G6
    end

    %% G1 Details
    C1("don.brainstorm"):::cmd
    P1("problem-frame.md"):::proof
    O1("Owner: John / Don"):::owner
    G1 -.-> C1 -.-> P1 -.-> O1

    %% G2 Details
    C2("don.elicit"):::cmd
    P2("elicitation-log.md"):::proof
    O2("Owner: Mary / Don"):::owner
    G2 -.-> C2 -.-> P2 -.-> O2

    %% G3 Details
    C3("don.prd / don.validate-prd"):::cmd
    P3("prd.md + verify-prd.md"):::proof
    O3("Owner: John / Mary / Don"):::owner
    G3 -.-> C3 -.-> P3 -.-> O3

    %% FORK POST GATE 03
    subgraph "Post-Gate 03 Fork (Enrichment)"
        F_ARCH["don.architecture<br>architecture.md"]:::cmd
        F_UX["don.ux<br>ux-design-specification.md"]:::cmd
    end
    
    G3 -.-> F_ARCH
    G3 -.-> F_UX
    
    F_NOTE1("Design blocked if missing architecture.md"):::note
    F_NOTE2("Design blocked if missing ux-design-specification.md"):::note
    
    F_ARCH -.-> F_NOTE1 -.-> G5
    F_UX -.-> F_NOTE2 -.-> G5

    %% G4 Details
    C4("don.breakdown"):::cmd
    P4("epics.md"):::proof
    O4("Owner: Mary / Don"):::owner
    G4 -.-> C4 -.-> P4 -.-> O4

    %% G5 Details
    C5("don.design"):::cmd
    P5("artifact/solution-scope.yml"):::proof
    O5("Owner: Sally / Don"):::owner
    G5 -.-> C5 -.-> P5 -.-> O5

    %% G6 Details
    C6("don.verify-solution"):::cmd
    P6("verification bundle"):::proof
    O6("Owner: Sally / Don"):::owner
    G6 -.-> C6 -.-> P6 -.-> O6
```
