# LLM Council Deliberation: Issue #5 — MCP (Model Context Protocol) Client Support

**Date**: 2026-08-19  
**Status**: Deliberation Complete  
**Participants**: Architecture, Security, DevEx, Ecosystem, Risk Councils

---

## Executive Summary

**Recommendation**: **PROCEED** with MCP client implementation. High strategic value, manageable risk, clear integration path.

**Priority**: P1 — Unlocks entire MCP ecosystem (97M+ monthly SDK downloads)  
**Estimated Effort**: 2-3 weeks for MVP (stdio + SSE transports)

---

## 1. The Question Framed

> Should we add MCP client support to the harness? What's the right integration approach with existing ToolRegistry? Which transports to prioritize? What are the risks?

### Sub-Questions
1. **Integration Model**: Wrap MCP tools as first-class `Tool` objects in `ToolRegistry`, or keep separate?
2. **Transport Priority**: stdio (local processes) → SSE (remote HTTP) → WebSocket (real-time)
3. **Config Schema**: How to declare MCP servers in `harness.config.yaml`?
4. **Security**: Sandboxing, approval gates, credential handling
5. **SubAgent Access**: How do SubAgents discover and call MCP tools?

---

## 2. Current Architecture Analysis

### Existing Tool System
```
ToolRegistry (Map<string, Tool>)
  └── Tool { name, description, inputSchema: JSONSchema, handler }
       ├── file_read
       ├── file_write
       ├── terminal
       ├── file_exists
       └── list_dir
```

### SubAgent Tool Access
```typescript
// SubAgent.registerTool(name, handler)
// SubAgent.callTool(toolName, args)
// SubAgent.availableTools() → ToolDefinition[]
```

### MasterAgent Delegation
```typescript
MasterAgent.addSubAgent(sub)
MasterAgent.executeWorkflow(workflow) // picks agent, delegates task
```

### Key Insight
The `ToolRegistry` + `ToolCallServer` pattern is **already MCP-compatible** — MCP tools expose the same interface: `{name, description, inputSchema, handler}`. Integration is a matter of **discovery + transport + config**.

---

## 3. Council Positions

### 🏗️ Architecture Council: **APPROVE with Conditions**

**Position**: MCP client should be a **thin adapter layer** over `ToolRegistry`, not a parallel system.

**Integration Pattern**:
```typescript
// New: MCPClient discovers tools from servers, registers in ToolRegistry
class MCPClient {
  constructor(private registry: ToolRegistry) {}
  
  async connect(config: MCPServerConfig): Promise<Tool[]> {
    const tools = await this.discoverTools(config);
    for (const tool of tools) this.registry.register(tool);
    return tools;
  }
}
```

**Why this works**:
- Zero changes to `SubAgent`, `ToolCallServer`, `MasterAgent`
- MCP tools appear identical to built-in tools
- Single source of truth for tool discovery

**Conditions**:
1. Transport abstraction: `MCPTransport` interface (stdio/SSE/WS plugins)
2. Connection lifecycle: connect/disconnect/reconnect with health checks
3. Namespace prefixing: `mcp.{server}.{tool}` to avoid collisions

---

### 🔒 Security Council: **CONDITIONAL APPROVE**

**Risks Identified**:
| Risk | Severity | Mitigation |
|------|----------|------------|
| Arbitrary command execution via stdio servers | HIGH | Allowlist approved commands; sandbox subprocess |
| Credential leakage in MCP server config | HIGH | Secret references (`${SECRET_NAME}`), never inline |
| Untrusted remote SSE/WS servers | MEDIUM | TLS pinning, origin allowlist, request signing |
| Tool schema injection (malicious inputSchema) | MEDIUM | Validate schemas against allowlist; reject `any` types |
| SubAgent privilege escalation via MCP tools | LOW | Per-agent tool allowlist in `AgentConfig.tools` |

**Required Controls**:
```yaml
# harness.config.yaml
mcp:
  servers:
    - name: "filesystem"
      transport: "stdio"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/allowed/root"]
      # Security: command must be in allowlist
      approvedCommands: ["npx", "uvx", "python", "node"]
    - name: "github"
      transport: "sse"
      url: "https://api.github.com/mcp"
      headers:
        Authorization: "${GITHUB_MCP_TOKEN}"  # Secret ref, not inline
      tlsPinning: true
      allowedOrigins: ["api.github.com"]
  # Global security policy
  security:
    requireApprovalFor: ["terminal", "file_write", "mcp.*.terminal"]
    sandboxStdio: true
    maxConcurrentConnections: 10
```

---

### 🎯 DevEx Council: **STRONGLY APPROVE**

**User Experience Goals**:
```bash
# CLI: harness mcp add <name> --stdio <cmd> [args...]
harness mcp add filesystem --stdio npx -- -y @modelcontextprotocol/server-filesystem /home/user/projects

# CLI: harness mcp add <name> --sse <url>
harness mcp add github --sse https://api.github.com/mcp --header "Authorization: Bearer $GITHUB_TOKEN"

# CLI: harness mcp list
harness mcp list
# NAME       TRANSPORT  STATUS     TOOLS
# filesystem stdio      connected  8
# github     sse        connected  12

# CLI: harness mcp remove <name>
harness mcp remove github
```

**Config-Driven (harness.config.yaml)**:
```yaml
mcp:
  servers:
    - name: "filesystem"
      transport: "stdio"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE_ROOT}"]
      env:
        NODE_ENV: "production"
    - name: "postgres"
      transport: "stdio"
      command: "uvx"
      args: ["mcp-server-postgres", "${DATABASE_URL}"]
    - name: "github"
      transport: "sse"
      url: "https://api.githubcopilot.com/mcp"
      headers:
        Authorization: "${GITHUB_COPILOT_TOKEN}"
```

**SubAgent Discovery**:
```typescript
// SubAgent automatically sees MCP tools via ToolRegistry
const sub = new SubAgent({
  tools: ["file_read", "mcp.filesystem.read_file", "mcp.github.create_issue"]
}, memory);
// SubAgent.availableTools() includes MCP tools
```

---

### 🌐 Ecosystem Council: **STRONGLY APPROVE**

**MCP Ecosystem Value** (as of 2026-08):
- **97M+ monthly SDK downloads** (per Anthropic)
- **1000+ public servers** on `github.com/modelcontextprotocol/servers`
- **Major integrations**: GitHub, GitLab, PostgreSQL, Redis, Kubernetes, AWS, GCP, Azure, Slack, Notion, Linear, Jira, Figma, Browser, Playwright, Puppeteer, SQLite, DuckDB, etc.
- **Backed by**: Anthropic, OpenAI, Google, Microsoft, Cursor, Windsurf, Cline, Zed, Continue, Sourcegraph

**Strategic Impact**:
- Harness becomes **MCP-native** — agents can use any MCP server
- Eliminates need for custom tool integrations (GitHub API, DB drivers, etc.)
- Future-proof: as MCP grows, harness automatically gains capabilities
- Competitive parity: LangGraph, AutoGen, CrewAI all adding MCP support

**Recommended Server Priorities** (by utility):
| Tier | Servers | Use Case |
|------|---------|----------|
| P0 | filesystem, github, gitlab, postgres, sqlite | Core dev workflows |
| P1 | browser/playwright, kubernetes, aws, gcp, azure | Infra/DevOps |
| P2 | slack, notion, linear, jira, figma | Product/Design |
| P3 | Custom internal servers | Enterprise |

---

### ⚠️ Risk Council: **MITIGATED — PROCEED WITH GUARDRAILS**

**Risk Assessment**:
| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| MCP spec changes (pre-1.0) | MEDIUM | MEDIUM | Pin to MCP SDK version; adapter pattern isolates changes |
| Transport fragmentation | LOW | MEDIUM | Abstract `MCPTransport` interface; stdio/SSE/WS as plugins |
| Performance overhead | LOW | LOW | Connection pooling; lazy tool registration |
| Dependency bloat | MEDIUM | LOW | Optional dependency (`@modelcontextprotocol/sdk`); lazy load |
| Security vulnerabilities in MCP servers | MEDIUM | HIGH | Sandbox stdio; TLS pinning for SSE; approval gates |

**Deal-Breakers** (would cause REJECT):
- ❌ MCP requires runtime not available in Node.js 20+ (false — full support)
- ❌ License incompatibility (MCP SDK is MIT — compatible)
- ❌ No stdio support (critical for local servers — SDK supports it)

**All deal-breakers cleared**.

---

## 4. Recommended Implementation Plan

### Phase 1: Core MCP Client (Week 1)
```typescript
// src/core/mcp/client.ts
export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'sse' | 'websocket';
  // stdio
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  // sse/websocket
  url?: string;
  headers?: Record<string, string>;
  // security
  approvedCommands?: string[];
  tlsPinning?: boolean;
  allowedOrigins?: string[];
}

export class MCPClient {
  constructor(
    private registry: ToolRegistry,
    private security: MCPSecurityPolicy
  ) {}
  
  async connect(config: MCPServerConfig): Promise<Tool[]>
  async disconnect(name: string): Promise<void>
  async listConnections(): Promise<MCPConnectionStatus[]>
  async refreshTools(name: string): Promise<Tool[]>
}
```

### Phase 2: Transport Implementations (Week 1-2)
```typescript
// src/core/mcp/transports/
// stdio-transport.ts  — spawn child_process, JSON-RPC over stdin/stdout
// sse-transport.ts    — EventSource + fetch for HTTP/SSE
// ws-transport.ts     — WebSocket client for real-time
```

### Phase 3: Config + CLI (Week 2)
```typescript
// src/config/schema.ts — add MCPServersSchema
// src/cli.ts — harness mcp add|list|remove|status
```

### Phase 4: Security Hardening (Week 2-3)
- Subprocess sandboxing (stdio)
- Secret reference resolution
- Per-agent tool allowlists
- Approval gates for sensitive tools

### Phase 5: Tests + Docs (Week 3)
- Unit tests: transport mocks, schema validation
- Integration test: connect to `@modelcontextprotocol/server-filesystem`
- E2E: SubAgent calls MCP tool in workflow

---

## 5. Schema Extensions

### Config Schema (harness.config.yaml)
```typescript
// src/config/schema.ts additions
export const MCPServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(['stdio', 'sse', 'websocket']),
  // stdio
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  approvedCommands: z.array(z.string()).optional(),
  // sse/websocket
  url: z.string().url().optional(),
  headers: z.record(z.string()).default({}),
  tlsPinning: z.boolean().default(false),
  allowedOrigins: z.array(z.string()).default([]),
  // common
  enabled: z.boolean().default(true),
  reconnect: z.boolean().default(true),
  reconnectIntervalMs: z.number().int().positive().default(5000),
});

export const MCPSecurityConfigSchema = z.object({
  requireApprovalFor: z.array(z.string()).default([]),
  sandboxStdio: z.boolean().default(true),
  maxConcurrentConnections: z.number().int().positive().default(10),
  allowedSchemas: z.array(z.string()).optional(), // e.g. ["file_*", "github_*"]
});

export const MCPConfigSchema = z.object({
  servers: z.array(MCPServerConfigSchema).default([]),
  security: MCPSecurityConfigSchema.default({}),
});

// Extend HarnessConfigSchema
export const HarnessConfigSchema = z.object({
  // ... existing fields
  mcp: MCPConfigSchema.default({}),
});
```

### CLI Commands
```typescript
// src/cli.ts additions
program
  .command('mcp')
  .description('Manage MCP server connections')
  .addCommand(
    new Command('add')
      .argument('<name>', 'Server name')
      .option('--stdio <command>', 'Stdio transport command')
      .option('--args <args...>', 'Command arguments')
      .option('--sse <url>', 'SSE transport URL')
      .option('--ws <url>', 'WebSocket transport URL')
      .option('--header <header>', 'HTTP header (repeatable)')
      .action(async (name, opts) => { /* ... */ })
  )
  .addCommand(new Command('list').action(async () => { /* ... */ }))
  .addCommand(new Command('remove').argument('<name>').action(async (name) => { /* ... */ }))
  .addCommand(new Command('status').argument('<name>').action(async (name) => { /* ... */ }));
```

---

## 6. Integration Touchpoints

| Component | Change Required | Risk |
|-----------|----------------|------|
| `ToolRegistry` | None (MCP tools register as normal `Tool`) | ✅ None |
| `ToolCallServer` | None (iterates `registry.list()`) | ✅ None |
| `SubAgent` | None (uses `registry` via `callTool`) | ✅ None |
| `MasterAgent` | None (delegates to SubAgent) | ✅ None |
| `config/schema.ts` | Add `mcp` section | 🟡 Low |
| `config/loader.ts` | Resolve secret refs in MCP config | 🟡 Low |
| `cli.ts` | Add `mcp` command group | 🟡 Low |
| `types.ts` | Add `MCPServerConfig`, `MCPTransport` types | 🟡 Low |

---

## 7. Decision Matrix

| Criterion | Weight | Score (1-5) | Notes |
|-----------|--------|-------------|-------|
| Strategic Value | 30% | 5 | Unlocks 1000+ tools, industry standard |
| Implementation Effort | 20% | 3 | 2-3 weeks, well-scoped |
| Architecture Fit | 15% | 5 | Native ToolRegistry integration |
| Security Posture | 15% | 4 | Manageable with guardrails |
| Ecosystem Momentum | 10% | 5 | 97M downloads, major backers |
| Maintenance Burden | 10% | 3 | Transport plugins, SDK updates |
| **Weighted Total** | 100% | **4.4/5** | **STRONG GO** |

---

## 8. Council Verdict

### ✅ APPROVED — Proceed with Implementation

**Conditions**:
1. Implement as **adapter over ToolRegistry** — no parallel tool system
2. **stdio first**, SSE second, WebSocket third (defer if needed)
3. **Security-first**: sandbox, secret refs, approval gates, allowlists
4. **Config-driven** with CLI for management
5. **Lazy-load MCP SDK** — optional dependency, no bundle bloat
6. **Integration test** against `@modelcontextprotocol/server-filesystem` before merge

**Next Steps**:
1. Create spec: `specs/005-mcp-client-support/` (per Spec Kit)
2. Implement Phase 1-2 in feature branch
3. Security review of transport implementations
4. Dogfood: connect harness to GitHub MCP server for issue management

---

## 9. Minority Opinion (Devil's Advocate)

> "MCP is still pre-1.0. The spec may change. We could build a fragile abstraction."
> 
> **Rebuttal**: MCP 1.0 RC expected Q4 2026. SDK is stable. Adapter pattern isolates churn. Not adopting means building custom integrations for every tool — far more fragile.

> "stdio transport = arbitrary code execution risk."
> 
> **Rebuttal**: Same risk as `terminal` tool (already exists). Mitigated by command allowlist + sandbox. SubAgents already run arbitrary code via LLM — MCP doesn't change threat model.

---

## 10. Appendices

### A. MCP Protocol Primer
- **JSON-RPC 2.0** over stdio/SSE/WS
- **Methods**: `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read`, `prompts/list`, `prompts/get`
- **Tool schema**: JSON Schema (same as our `Tool.inputSchema`)

### B. Reference Implementation Sketch
```typescript
// Simplified stdio transport
import { spawn } from 'child_process';
import { createInterface } from 'readline';

class StdioTransport implements MCPTransport {
  private proc: ChildProcess;
  private rl: Interface;
  private pending = new Map<number, (response: any) => void>();
  private id = 0;

  async connect(config: MCPServerConfig): Promise<void> {
    this.proc = spawn(config.command!, config.args ?? [], { 
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'inherit']
    });
    this.rl = createInterface({ input: this.proc.stdout! });
    this.rl.on('line', (line) => this.handleResponse(JSON.parse(line)));
    await this.initialize();
  }

  async request(method: string, params?: any): Promise<any> {
    const id = ++this.id;
    this.proc.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    return new Promise((resolve) => this.pending.set(id, resolve));
  }
  // ... tools/list, tools/call wrappers
}
```

---

*End of Council Deliberation*  
*Document: `/docs/mcp-client-council.md`*  
*Next: Create spec in `specs/005-mcp-client-support/`*