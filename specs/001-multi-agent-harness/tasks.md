# Task List: Remaining Issues & Roadmap

This file tracks the outstanding issues and tasks for the `multi-agent-harness` project.

## Open Tasks / Remaining Issues

- [ ] **Issue #6: [Integration] A2A (Agent-to-Agent) Protocol Support**
  - Implement full standard Agent-to-Agent protocol communication hooks
  - Verify message schema exchange and routing

- [ ] **Issue #7: [Observability] OpenTelemetry Integration with GenAI Semantic Conventions**
  - Integrate OpenTelemetry SDK
  - Map LLM requests, token counts, latency, and agent traces to GenAI Semantic Conventions

- [ ] **Issue #8: [Security] Sandboxed Code Execution (E2B, Modal, gVisor, Firecracker)**
  - Implement secure microVM/container provider interfaces
  - Support Docker (local) and E2B (cloud) sandbox executors for terminal and file actions

- [ ] **Issue #9: [Evaluation] Agent Evaluation Harness (LLM-as-Judge, Trajectory, DeepEval/LangSmith Adapters)**
  - Support pluggable trajectory evaluators and LLM-as-judge scoring
  - Add adapters for DeepEval, LangSmith, and Braintrust

- [ ] **Issue #10: [DX] Visual Studio: Graph Inspector, Time-Travel Debugging, Drag-Drop Builder**
  - Build lightweight web-based interface (React Flow/Cytoscape)
  - Implement time-travel state debugging and resume via checkpointer APIs

- [ ] **Issue #11: [Enterprise] Multi-Tenant Architecture with RBAC, SSO, API Keys, Audit Logging**
  - Add tenant isolation database schemas (Postgres RLS/Redis Namespaces)
  - Add OIDC/SSO federated authentication and API key management

- [ ] **Issue #12: [API] REST API Server (Fastify) with SSE/WebSocket Streaming, OpenAPI Docs**
  - Implement Fastify REST endpoint controller for workflow and agent CRUD
  - Add Server-Sent Events (SSE) and WebSocket streams for real-time monitoring

- [ ] **Issue #13: [LLM] Structured Output with Schema Validation & Auto-Retry (Zod/JSON Schema)**
  - Implement Zod/JSON Schema to function calling mapping
  - Add validation retry loop with feedback to the provider on schema failure

- [ ] **Issue #14: [Observability] Cost Tracking, Budgets, Alerts & Hard Limits**
  - Add token-based cost tracking at agent/thread/workflow levels
  - Implement Prometheus metrics and webhook alerts for threshold limits

- [ ] **Issue #15: [SDK] Python SDK with Feature Parity (pip package)**
  - Build `multi-agent-harness-py` client SDK using OpenAPI generated models
  - Maintain API alignment with TypeScript SDK facades

- [ ] **Issue #16: [Memory] Vector Memory with Semantic Search, Embeddings, Consolidation (pgvector, Pinecone, etc.)**
  - Define `VectorMemoryStore` interface extending existing `MemoryStore`
  - Implement local vector indexing (HNSW) and remote store adapters (SQLite-vec, pgvector, Pinecone)
