---
title: DON Workspace MCP Server Implementation Plan
status: active
date: 2026-03-23
description: Implementation plan for a local stdio MCP Server acting as a hub for FTS5-BM25 local RAG, Figma, Jira, and Confluence.
---

# DON Workspace MCP Server Implementation Plan

## Executive Summary
This plan outlines the rapid implementation of the DON Workspace MCP Server, a local `stdio` Node.js application that provides AI Agents (Gemini/Codex) with tool access to an offline SQLite FTS5-BM25 knowledge base, as well as acting as a central router for external integrations (Figma, Jira, Confluence).

## 1. Project Scaffolding
- Initialize a Node.js + TypeScript project.
- Install `@modelcontextprotocol/sdk`, `better-sqlite3`, `zod`, and `dotenv`.
- Setup `tsconfig.json` and build scripts.

## 2. Core implementation
### 2.1. Server Initialization
- `src/index.ts`: Instantiate the MCP `Server` via `Server` class.
- Connect via `StdioServerTransport`.

### 2.2. SQLite FTS5 Search Tool
- `src/tools/search_kb.ts`: 
  - Connect to `remote-rag.db`.
  - Expose tool `search_company_kb` with parameters `query_expansion_keywords` and `project_id`.
  - Execute Hybrid FTS5 + Metadata query.
  - Return truncated snippets.

### 2.3. External Connectors (Stubs & Proxies)
- `src/tools/figma.ts`: Define Figma tools (e.g., `get_design_tokens`).
- `src/tools/jira.ts`: Define Jira tools (e.g., `get_ticket`).
- `src/tools/confluence.ts`: Define Confluence tools (e.g., `scrape_doc`).

## 3. Git Operations
- Initialize `.gitignore`.
- Commit the initial implementation.
- `git push -u origin main` to the remote repository `https://github.com/cachep-xidau/MCP-server.git`.

## 4. Risks & Considerations
- **SQLite Concurrency:** Read-only queries from the MCP will not block background syncing, provided WAL mode is active.
- **Git Push Failure:** If the local environment lacks SSH/Token auth for GitHub, the final push step may fail and require user intervention.
