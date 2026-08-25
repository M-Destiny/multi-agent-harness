# Feature Specification: MCP (Model Context Protocol) Client Support

**Feature Branch**: `005-mcp-client-support`

**Created**: 2026-08-19

**Status**: Draft

**Input**: Add MCP client support to the harness to access the MCP ecosystem of tools. Current architecture has custom ToolRegistry. Need MCP client supporting stdio, SSE, WebSocket transports with config-driven server connections.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - MCP Server Connection Management (Priority: P1)
A developer wants to connect the harness to MCP servers (local stdio processes or remote SSE/WS endpoints) and have their tools automatically available to agents.

**Why this priority**: Core capability - without connection management, no MCP tools can be used.

**Independent Test**: Can be fully tested by connecting to `@modelcontextprotocol/server-filesystem` via stdio and verifying tools appear in `harness mcp list` and are callable.

**Acceptance Scenarios**:
1. **Given** a stdio MCP server config, **When** `harness mcp add` runs, **Then** connection establishes and tools are registered
2. **Given** an SSE MCP server config, **When** `harness mcp add` runs, **Then** connection establishes with TLS/headers
3. **Given** multiple servers, **When** `harness mcp list` runs, **Then** all show status and tool counts

---

### User Story 2 - Tool Discovery & Registration (Priority: P1)
MCP tools discovered from connected servers must appear in `ToolRegistry` and be callable by SubAgents exactly like built-in tools.

**Why this priority**: Seamless integration - agents shouldn't distinguish MCP tools from native tools.

**Independent Test**: Can be fully tested by having a SubAgent call an MCP tool (e.g., `mcp.filesystem.read_file`) and verifying correct execution.

**Acceptance Scenarios**:
1. **Given** connected MCP server with tools, **When** SubAgent calls `availableTools()`, **Then** MCP tools appear with `mcp.{server}.{tool}` naming
2. **Given** MCP tool with JSON Schema, **When** SubAgent calls it via `callTool()`, **Then** arguments validated, result returned
4. **Given** tool name collision, **When** second server registers same tool, **Then** namespaced name prevents conflict

---

### User Story 3 - Config-Driven MCP Servers (Priority: P1)
MCP server connections declared in `harness.config.yaml` with secret references for credentials.

**Why this priority**: Production deployments need declarative, version-controlled config with secure credential handling.

**Independent Test**: Can be fully tested by defining servers in config, running `harness run`, and verifying auto-connection on startup.

**Acceptance Scenarios**:
1. **Given** `harness.config.yaml` with MCP servers, **When** harness initializes, **Then** all enabled servers connect automatically
2. **Given** config with `${SECRET_REF}` placeholders, **When** config loads, **Then** secrets resolved from environment
3. **Given** disabled server in config, **When** harness starts, **Then** server not connected

---

### User Story 4 - Security & Approval Gates (Priority: P2)
MCP tools require approval gates, command allowlists for stdio, and per-agent tool permissions.

**Why this priority**: MCP servers execute arbitrary code (stdio) or access remote APIs - must be controlled.

**Independent Test**: Can be fully tested by attempting to call restricted MCP tool without approval and verifying rejection.

**Acceptance Scenarios**:
1. **Given** stdio server with unapproved command, **When** connect attempted, **Then** rejected with clear error
2. **Given** tool in `requireApprovalFor` list, **When** SubAgent calls it, **Then** approval gate triggers (or fails in CI)
3. **Given** agent with limited `tools` allowlist, **When** agent calls disallowed MCP tool, **Then** permission denied

---

### User Story 5 - Transport Resilience (Priority: P2)
Connections handle disconnect/reconnect, health checks, and graceful degradation.

**Why this priority**: Remote SSE/WS servers may restart; stdio processes may crash.

**Independent Test**: Can be fully tested by killing MCP server process and verifying auto-reconnect.

**Acceptance Scenarios**:
1. **Given** stdio server crashes, **When** `reconnect: true`, **Then** client restarts process and re-discovers tools
2. **Given** SSE connection drops, **When** `reconnect: true`, **Then** client re-establishes EventSource
3. **Given** server unhealthy, **When** health check fails, **Then** tools marked unavailable until recovery

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide `MCPClient` class managing multiple server connections
- **FR-002**: System MUST support three transports: `stdio` (local process), `sse` (HTTP/SSE), `websocket` (WS)
- **FR-003**: System MUST discover tools via MCP `tools/list` and register in `ToolRegistry` with namespaced names
- **FR-004**: System MUST execute MCP tools via `tools/call` and return results compatible with `ToolResult`
- **FR-005**: System MUST support config-driven server declarations in `harness.config.yaml`
- **FR-006**: System MUST resolve secret references (`${VAR_NAME}`) in config from environment
- **FR-007**: System MUST provide CLI: `harness mcp add|list|remove|status`
- **FR-008**: System MUST enforce command allowlist for stdio transports
- **FR-009**: System MUST support per-agent tool allowlists (existing `AgentConfig.tools`)
- **FR-010**: System MUST implement approval gates for sensitive tools (configurable)
- **FR-011**: System MUST support auto-reconnect with configurable interval
- **FR-012**: System MUST health-check connections and surface status via CLI

### Key Entities

- **MCPServerConfig**: Server declaration (name, transport, command/url, auth, security)
- **MCPTransport**: Interface for stdio/SSE/WS implementations
- **MCPConnection**: Active connection with lifecycle (connecting, connected, disconnected, error)
- **MCPSecurityPolicy**: Global + per-server security rules
- **MCPTool**: Discovered tool with namespace prefix (`mcp.{server}.{tool}`)

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Connect to `@modelcontextprotocol/server-filesystem` via stdio and call `read_file` tool in < 2s
- **SC-002**: Connect to GitHub MCP SSE endpoint and list 10+ tools
- **SC-003**: SubAgent executes workflow using mixed built-in + MCP tools seamlessly
- **SC-004**: Config with 5 servers loads and connects all in < 5s on startup
- **SC-005**: Stdio command allowlist rejects unapproved commands with clear error
- **SC-006**: Secret reference resolution works for API keys in headers/env
- **SC-007**: Auto-reconnect restores stdio connection within 10s of process crash
- **SC-008**: All TypeScript compiles (`tsc --noEmit`) and tests pass (`vitest run`)

---

## Assumptions

- Target runtime: Node.js 20+ with TypeScript 5+
- MCP SDK: `@modelcontextprotocol/sdk` (MIT license, compatible)
- MCP Protocol: 2025-06-18 spec (JSON-RPC 2.0, compatible with our Tool interface)
- Secret management: Environment variables only (no external vault for MVP)
- Test MCP servers: `@modelcontextprotocol/server-filesystem`, `@modelcontextprotocol/server-github`
- CLI framework: Commander (existing)

---

## Edge Cases

- What happens when MCP server returns tool with invalid JSON Schema? → Reject registration, log warning
- What if two servers expose same tool name? → Namespace prefix `mcp.{server}.{tool}` prevents collision
- What if stdio process exits unexpectedly? → Auto-reconnect if enabled, mark tools unavailable
- What if SSE server requires authentication? → Headers from config with secret resolution
- What if tool execution times out? → Apply existing `AgentConfig.timeoutMs` / `Tool` timeout
- How to handle MCP `resources` and `prompts`? → Phase 2 (tools only for MVP)
- What if MCP spec changes? → Adapter pattern isolates protocol; pin SDK version