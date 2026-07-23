# DON Workspace Knowledge Hub

**Ngày:** March 2026
**Repository:** [MCP-server](https://github.com/cachep-xidau/MCP-server.git)

## 1. Executive Summary

Một Model Context Protocol (MCP) server (`DON-Workspace-MCP`) giúp LLM assistant (Claude Desktop / Cursor / Antigravity) truy cập có kiểm soát vào kho kiến thức nội bộ của công ty. Hệ thống kết hợp:

- một **semantic knowledge base** — embedding bằng OpenAI **`text-embedding-3-small`** + vector search trên **ChromaDB**, giới hạn theo ACL cho từng caller; và
- một **live REST hub** — các tool gọi trực tiếp Jira, Confluence, Figma khi kho offline không đủ.

Server là **một process Node.js/TypeScript** chạy trên **VPS**, giao tiếp MCP qua stdio. Retrieval dùng **dense vector similarity** (semantic), hiểu được câu hỏi diễn đạt khác nhau chứ không chỉ khớp keyword.

**Nguyên tắc cốt lõi:**
- **Single source of truth:** một ChromaDB collection duy nhất trên VPS. Không local mirror, không `rsync` replica, không staleness.
- **Governed access:** RBAC/ACL pre-filter (Chroma `where`) giới hạn mọi KB query về đúng các project mà caller được phép, trước khi ranking.

## 2. Architecture & Topology

Mọi thứ chạy trên **VPS**. Một ingestion job chạy nền (nằm ngoài repo này) định kỳ embed tài liệu Atlassian bằng `text-embedding-3-small` và upsert vào ChromaDB; MCP server embed query và vector-search collection đó, đồng thời mở thêm các live REST tool.

### 2.1 Context Diagram
```mermaid
graph TD
    User((BA / User))
    Agent(AI Agent - Claude Desktop / Cursor)
    MCP[DON-Workspace-MCP - VPS - Node/TS, stdio]
    OpenAI[[OpenAI Embeddings - text-embedding-3-small]]
    Chroma[(ChromaDB - Vector Store)]
    Atlassian[(Atlassian Cloud - Jira / Confluence)]
    Figma[(Figma API)]

    User -->|Chat / yêu cầu phân tích| Agent
    Agent -->|Gọi MCP tools qua stdio| MCP
    MCP -->|Embed query| OpenAI
    MCP -->|Vector search theo ACL| Chroma
    MCP -->|REST fallback trực tiếp| Atlassian
    MCP -->|Nodes / design tokens| Figma
```

### 2.2 Container Diagram
```mermaid
C4Container
    title Container Diagram - DON Workspace MCP Server

    Person(user, "BA / User", "Đặt câu hỏi qua AI agent")
    Container_Ext(agent, "AI Agent", "Claude Desktop / Cursor / Antigravity")
    System_Ext(openai, "OpenAI Embeddings", "text-embedding-3-small")
    System_Ext(atlassian, "Atlassian Cloud", "Jira / Confluence")
    System_Ext(figma, "Figma", "Design files")
    System_Ext(ingest, "Ingestion Job", "Cron, bên ngoài")

    System_Boundary(vps, "VPS") {
        Container(mcp, "DON-Workspace-MCP", "Node.js / TypeScript, stdio", "MCP tools; enforce RBAC/ACL")
        ContainerDb(chroma, "ChromaDB", "Vector store", "collection company_kb")
    }

    Rel(user, agent, "Trò chuyện")
    Rel(agent, mcp, "Gọi tools", "MCP stdio / Tailscale SSH")
    Rel(mcp, openai, "Embed query", "HTTPS")
    Rel(mcp, chroma, "Vector search theo ACL where-filter")
    Rel(mcp, atlassian, "REST trực tiếp", "HTTPS")
    Rel(mcp, figma, "REST trực tiếp", "HTTPS")
    Rel(ingest, atlassian, "Cào dữ liệu", "HTTPS")
    Rel(ingest, openai, "Embed tài liệu", "HTTPS")
    Rel(ingest, chroma, "Upsert vectors + metadata", "cron")
```

### 2.2.1 MCP Tools
| Tool | Nguồn | Chức năng |
| :--- | :--- | :--- |
| `search_company_kb` | ChromaDB + OpenAI embeddings | Semantic search theo ACL; trả top-5 `{title, snippet, url}`. |
| `get_jira_ticket` | Jira REST v3 | Lấy summary/status/description của ticket theo issue key. |
| `search_confluence_live` | Confluence REST (CQL) | Tìm page trực tiếp khi kho offline thiếu kết quả. |
| `get_figma_nodes` | Figma REST v1 | Lấy file components / nodes / design tokens (cắt bớt để tiết kiệm token). |

### 2.2.2 Knowledge-Base Retrieval (`search_company_kb`)
- **Embedding:** query được embed bằng OpenAI `text-embedding-3-small` (qua Chroma `embeddingFunction`) — cùng model với ingestion để vector nằm chung không gian.
- **Vector store:** ChromaDB collection `company_kb`; mỗi item có `document` (text) + metadata `{project, title, url}`.
- **Ranking:** dense similarity, top-5.
- **ACL pre-filter:** `resolveAclScope()` sinh Chroma `where: { project: { $in: [...] } }`; request ngoài scope bị từ chối, tài liệu ngoài quyền không vào tập candidate.

### 2.2.3 Access Control (RBAC / ACL) & Cấu hình
Cấu hình theo từng deployment qua env vars:
- `RBAC_ROLE` — role của caller (dành cho role-aware gating sau này).
- `ACL_ALLOWED_PROJECTS` — danh sách project key được phép; bỏ trống = không giới hạn.
- `OPENAI_API_KEY`, `OPENAI_EMBED_MODEL` (mặc định `text-embedding-3-small`).
- `CHROMA_URL` (mặc định `http://localhost:8000`), `CHROMA_COLLECTION` (mặc định `company_kb`).
- `JIRA_HOST` / `JIRA_EMAIL` / `JIRA_API_TOKEN`, `API_KEY_FIGMA`.

### 2.2.4 Design Note — VPS-only
Edge mirror trước đây (`sync-db.sh` rsync mỗi 4h) đã gỡ bỏ — gây staleness tới 4h đổi lấy độ lợi latency không đáng kể. Client kết nối qua Tailscale SSH stdio; ChromaDB chạy trên VPS.

## 3. Data Flow

### 3.1 Ingestion
```mermaid
sequenceDiagram
    autonumber
    participant Cron as VPS Cron (ingestion)
    participant Atlas as Atlassian
    participant OpenAI as OpenAI Embeddings
    participant Chroma as ChromaDB

    Cron->>Atlas: Lấy pages/issues từ các Space
    Atlas-->>Cron: Raw HTML / JSON
    Note over Cron: Sanitize + chunk; gắn metadata {project, title, url}
    Cron->>OpenAI: Embed chunks (text-embedding-3-small)
    OpenAI-->>Cron: Vectors
    Cron->>Chroma: Upsert vectors + metadata vào collection company_kb
```
> Ingestion job vận hành trên VPS và **không thuộc repository này**.

### 3.2 Governed KB Query
```mermaid
sequenceDiagram
    autonumber
    actor User as User
    participant AI as AI Agent (LLM)
    participant MCP as DON-Workspace-MCP (VPS)
    participant ACL as access-control.ts
    participant OpenAI as OpenAI Embeddings
    participant Chroma as ChromaDB

    User->>AI: "Tìm PRD Notification trong AIA"
    AI->>MCP: search_company_kb(query, project_id="AIA")
    MCP->>ACL: resolveAclScope("AIA")
    alt project ngoài ACL scope
        ACL-->>MCP: AclDeniedError
        MCP-->>AI: "Access denied: project 'AIA' is outside your ACL scope."
    else trong scope
        ACL-->>MCP: { projects: ["AIA"] }
        MCP->>OpenAI: Embed query
        OpenAI-->>MCP: Query vector
        MCP->>Chroma: query(vector, where={project $in ['AIA']}, nResults=5)
        Chroma-->>MCP: Top-5 (document, metadata)
        MCP-->>AI: Markdown context + citations
        AI-->>User: Câu trả lời đã tổng hợp
    end
```

## 4. AI Coworker (DON BSA Gates Timeline)

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

## 5. Đánh giá Hiệu năng: RAG + Workflow vs. Direct Search

So sánh giữa tìm kiếm trực tiếp thủ công (Direct Search / Single Skills) và MCP server này — kết hợp semantic knowledge base (ChromaDB, theo ACL) với các BA workflow tự động.

| Tiêu chí đánh giá | Direct Search / Single Skills | KB + Workflow (MCP-server) |
| :--- | :--- | :--- |
| **Context Precision** | Trung bình. Tra keyword thủ công qua nhiều tool. | **Cao.** Dense vector search hiểu ngữ nghĩa; top-5 kết quả liên quan nhất. |
| **Fuzzy / Paraphrased Queries** | Thấp. Trượt nếu không đúng keyword. | **Cao.** Embedding hiểu ý định dù diễn đạt khác nhau. |
| **Access Governance** | Không có. User xem mọi thứ họ mở được. | **Có enforce.** RBAC/ACL pre-filter (Chroma `where`) giới hạn kết quả về đúng project được phép. |
| **Automation Rate** | ~30% - 40% (phải lọc/nối/switch thủ công). | **~85% - 90%** (context tự động đưa vào analysis pipeline). |
| **Development Time** | Thấp (dùng tool có sẵn). | **Trung bình** ban đầu (MCP server, ChromaDB, OpenAI embeddings, RBAC/ACL, Tailscale). |
| **Error Rate** | Cao. Thiếu tài liệu / đứt context. | **Thấp.** Top-5 semantic giảm nhiễu đưa vào LLM. |
| **Human-in-the-loop** | Liên tục. | **Thưa.** Chỉ can thiệp ở các "Gate" duyệt. |
| **Token Consumption** | Cao (nạp lại context thừa). | **Tối ưu** (chỉ inject top-5 chunk liên quan). |

### 5.1 Công thức tính ROI

$$ROI = \frac{\sum(T \times C) + \Delta R - (D + O)}{\sum(D + O)}$$

**Trong đó:**
- **T**: Thời gian tiết kiệm (giờ).
- **C**: Chi phí lao động trung bình ($/h).
- **$\Delta R$**: Doanh thu tăng thêm nhờ xử lý nhanh hơn.
- **D**: Chi phí Development & Deployment (CapEx).
- **O**: Chi phí vận hành — VPS, LLM tokens, OpenAI embeddings, v.v. (OpEx).
