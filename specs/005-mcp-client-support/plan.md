# Implementation Plan: MCP Client Support

## Phase Breakdown

### Phase 1: Core Types & Config (Day 1-2)
**Goal**: Define MCP config schema, types, and config loading with secret resolution

**Tasks**:
- [ ] Add `MCPServerConfigSchema`, `MCPSecurityPolicySchema`, `MCPConfigSchema` to `src/config/schema.ts`
- [ ] Extend `HarnessConfigSchema` with `mcp` field
- [ ] Update `src/config/loader.ts` to resolve `${SECRET_REF}` in MCP config
- [ ] Add MCP types to `src/core/types.ts` (`MCPServerConfig`, `MCPConnection`, `MCPTransport`, `MCPTool`, `MCPSecurityPolicy`)
- [ ] Create `src/core/mcp/` directory structure

**Files**:
- `src/config/schema.ts` (modify)
- `src/config/loader.ts` (modify)
- `src/core/types.ts` (modify)
- `src/core/mcp/types.ts` (new)

**Tests**:
- Config schema validation (valid/invalid configs)
- Secret reference resolution
- Transport-specific field validation

---

### Phase 2: Transport Abstraction (Day 2-4)
**Goal**: Implement `MCPTransport` interface with stdio, SSE, WebSocket implementations

**Tasks**:
- [ ] Define `MCPTransport` interface in `src/core/mcp/transports/index.ts`
- [ ] Implement `StdioTransport` in `src/core/mcp/transports/stdio.ts`
  - Spawn child process with JSON-RPC over stdin/stdout
  - Handle process lifecycle, stdout/stderr parsing
  - Request/response correlation with ID mapping
  - Auto-reconnect on process exit
- [ ] Implement `SseTransport` in `src/core/mcp/transports/sse.ts`
  - EventSource for server→client messages
  - Fetch for client→server requests
  - TLS pinning support
  - Reconnection with exponential backoff
- [ ] Implement `WebSocketTransport` in `src/core/mcp/transports/websocket.ts`
  - Native WebSocket client
  - Ping/pong keepalive
  - Reconnection logic

**Files**:
- `src/core/mcp/transports/index.ts` (new)
- `src/core/mcp/transports/stdio.ts` (new)
- `src/core/mcp/transports/sse.ts` (new)
- `src/core/mcp/transports/websocket.ts` (new)

**Tests**:
- Transport unit tests with mock servers
- Stdio: spawn mock MCP server, verify JSON-RPC roundtrip
- SSE: mock EventSource + fetch, verify message flow
- WS: mock WebSocket server, verify ping/pong and reconnect

---

### Phase 3: MCP Client Core (Day 4-6)
**Goal**: Implement `MCPClient` managing connections, tool discovery, registration

**Tasks**:
- [ ] Create `MCPClient` class in `src/core/mcp/client.ts`
  - `connect(config)`: Create transport, initialize, discover tools, register in ToolRegistry
  - `disconnect(name)`: Clean disconnect, unregister tools
  - `listConnections()`: Return status for all connections
  - `refreshTools(name)`: Re-discover tools from server
- [ ] Implement MCP initialization handshake
- [ ] Implement `tools/list` discovery with schema validation
- [ ] Create `MCPTool` wrapper that calls `transport.request('tools/call', ...)`
- [ ] Register tools in `ToolRegistry` with namespaced names
- [ ] Handle connection lifecycle events (reconnect, error, close)
- [ ] Health check background task

**Files**:
- `src/core/mcp/client.ts` (new)
- `src/core/mcp/index.ts` (new - exports)

**Tests**:
- Connect to mock stdio server, verify tool registration
- Tool schema validation (reject invalid JSON Schema)
- Namespace collision handling
- Tool execution via MCPTool wrapper
- Disconnect cleans up ToolRegistry
- Reconnect re-registers tools

---

### Phase 4: Security & Approval (Day 6-8)
**Goal**: Implement security policy, command allowlist, approval gates

**Tasks**:
- [ ] Create `MCPSecurityManager` in `src/core/mcp/security.ts`
  - Validate stdio command against allowlist
  - Check tool against `requireApprovalFor` patterns
  - Enforce per-agent tool allowlist (existing `AgentConfig.tools`)
- [ ] Integrate security checks in `MCPClient.connect()`
- [ ] Add approval gate callback mechanism (for human-in-the-loop)
- [ ] Sandbox stdio processes (restrict filesystem, network if possible)

**Files**:
- `src/core/mcp/security.ts` (new)

**Tests**:
- Command allowlist rejects unapproved commands
- Tool approval patterns match correctly
- Per-agent tool allowlist enforced
- Secret references not logged

---

### Phase 5: CLI Commands (Day 8-9)
**Goal**: Add `harness mcp` command group for server management

**Tasks**:
- [ ] Add `mcp` command group in `src/cli.ts`
  - `harness mcp add <name> --stdio <cmd> [args...]`
  - `harness mcp add <name> --sse <url> [--header <h>...]`
  - `harness mcp add <name> --ws <url>`
  - `harness mcp list` (table: name, transport, status, tool count)
  - `harness mcp remove <name>`
  - `harness mcp status <name>` (detailed connection info)
- [ ] Persist added servers to config file (or in-memory for session)
- [ ] Auto-connect on `harness run` if config has servers

**Files**:
- `src/cli.ts` (modify)

**Tests**:
- CLI command parsing
- Config persistence
- List/status output formatting

---

### Phase 6: Integration & Auto-Connect (Day 9-10)
**Goal**: Wire MCP client into harness initialization

**Tasks**:
- [ ] Modify `MasterAgent` or create harness bootstrap to auto-connect MCP servers from config
- [ ] Ensure SubAgents see MCP tools via `ToolRegistry`
- [ ] Verify `ToolCallServer` works with MCP tools (no changes needed)
- [ ] Add MCP connection status to harness health check

**Files**:
- `src/core/master-agent.ts` (modify - add MCP client initialization)
- Or create new bootstrap module

**Tests**:
- Full integration: config with 2 servers → harness run → SubAgent calls MCP tool
- Mixed built-in + MCP tool workflow

---

### Phase 7: Tests & Documentation (Day 10-12)
**Goal**: Comprehensive test coverage and docs

**Tasks**:
- [ ] Unit tests for all new modules (>80% coverage)
- [ ] Integration test: connect to real `@modelcontextprotocol/server-filesystem`
- [ ] Integration test: connect to GitHub MCP SSE (if credentials available)
- [ ] E2E test: workflow using MCP tools
- [ ] Update README with MCP usage
- [ ] Create quickstart guide

**Files**:
- `tests/unit/mcp/` (new)
- `tests/integration/mcp.test.ts` (new)
- `README.md` (modify)
- `specs/005-mcp-client-support/quickstart.md` (new)

---

## Dependencies

### New Dependencies
```json
{
  "@modelcontextprotocol/sdk": "^1.0.0",  // MCP protocol types, helpers
  "ws": "^8.16.0"                          // WebSocket client (if not using native)
}
```

### Dev Dependencies
```json
{
  "@modelcontextprotocol/server-filesystem": "^1.0.0",  // For integration testing
  "@types/ws": "^8.5.10"
}
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| MCP SDK API changes | Pin exact version; adapter pattern isolates |
| Stdio process leaks | Proper cleanup in `disconnect()`; `process.kill()` on timeout |
| SSE connection storms | Exponential backoff; max reconnect attempts |
| Schema validation perf | Cache validated schemas; lazy validation |
| Secret leakage in logs | Redact `apiKey`, `token`, `authorization` in all MCP logging |

---

## Rollout Strategy

1. **Feature flag**: `mcp.enabled` in config (default: false)
2. **Phase 1-3**: Core implementation behind flag
3. **Phase 4**: Security hardening
4. **Phase 5-6**: CLI + integration
5. **Phase 7**: Tests + docs
6. **Enable by default** after integration tests pass

---

## Definition of Done

- [ ] All unit tests pass (`npm test`)
- [ ] Integration test connects to filesystem MCP server
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] ESLint passes (`npm run lint`)
- [ ] README updated with MCP usage
- [ ] Spec documents complete (spec.md, data-model.md, plan.md, quickstart.md)
- [ ] Security review of transport implementations
- [ ] Dogfood test: harness manages its own GitHub issues via MCP