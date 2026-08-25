# Quickstart: MCP Client Support

## Overview

The Multi-Agent Harness now supports **MCP (Model Context Protocol)** — the universal standard for agent-tool interoperability. Connect to any MCP server and its tools become instantly available to your agents, just like built-in tools.

## Prerequisites

- Node.js 20+
- MCP servers you want to connect to (local or remote)
- For stdio servers: the server command must be installed (e.g., `npx`, `uvx`)

## Quick Start

### 1. Add an MCP Server (CLI)

```bash
# Local stdio server (e.g., filesystem)
harness mcp add filesystem --stdio npx -- -y @modelcontextprotocol/server-filesystem /home/user/projects

# Remote SSE server (e.g., GitHub)
harness mcp add github --sse https://api.githubcopilot.com/mcp --header "Authorization: Bearer $GITHUB_TOKEN"

# List configured servers
harness mcp list
```

### 2. Configure in harness.config.yaml (Production)

```yaml
mcp:
  servers:
    - name: "filesystem"
      transport: "stdio"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE_ROOT}"]
      approvedCommands: ["npx", "uvx"]
      
    - name: "github"
      transport: "sse"
      url: "https://api.githubcopilot.com/mcp"
      headers:
        Authorization: "Bearer ${GITHUB_COPILOT_TOKEN}"
      tlsPinning: true
      
  security:
    requireApprovalFor:
      - "mcp.*.terminal"
      - "mcp.github.create_*"
    sandboxStdio: true
```

### 3. Run Harness — Servers Auto-Connect

```bash
harness run workflow.json
# MCP servers from config connect automatically on startup
```

### 4. Use MCP Tools in Agents

Tools are namespaced: `mcp.{server}.{tool}`

```typescript
const sub = new SubAgent({
  // ... config
  tools: [
    "file_read",                    // built-in
    "mcp.filesystem.read_file",     // MCP tool
    "mcp.github.create_issue"       // MCP tool
  ]
}, memory);

// SubAgent sees all tools uniformly
const tools = sub.availableTools();
// [
//   { name: "file_read", ... },
//   { name: "mcp.filesystem.read_file", ... },
//   { name: "mcp.github.create_issue", ... }
// ]

// Call MCP tool exactly like built-in
const result = await sub.callTool("mcp.filesystem.read_file", { path: "/home/user/file.txt" });
```

## CLI Reference

### `harness mcp add <name>`

Add an MCP server connection.

**Options**:
- `--stdio <command>` — Stdio transport command (e.g., `npx`)
- `--args <args...>` — Command arguments
- `--sse <url>` — SSE transport URL
- `--ws <url>` — WebSocket transport URL
- `--header <header>` — HTTP header (repeatable, for SSE/WS)
- `--env <KEY=VALUE>` — Environment variable (repeatable, for stdio)
- `--approved-commands <cmd...>` — Allowlist for stdio command

**Examples**:
```bash
# Filesystem server
harness mcp add fs --stdio npx -- -y @modelcontextprotocol/server-filesystem /workspace

# GitHub via SSE
harness mcp add gh --sse https://api.githubcopilot.com/mcp --header "Authorization: Bearer $TOKEN"

# PostgreSQL via stdio
harness mcp add pg --stdio uvx -- mcp-server-postgres "$DATABASE_URL" --approved-commands uvx
```

### `harness mcp list`

List all configured MCP servers with status.

**Output**:
```
NAME       TRANSPORT  STATUS      TOOLS
filesystem stdio      connected   8
github     sse        connected   12
postgres   stdio      disconnected 0
```

### `harness mcp status <name>`

Show detailed connection info for a server.

### `harness mcp remove <name>`

Remove an MCP server configuration.

## Security Model

### Command Allowlist (Stdio)
Only approved commands can be executed:
```yaml
approvedCommands: ["npx", "uvx", "python", "node"]
```

### Approval Gates
Sensitive tools require approval:
```yaml
security:
  requireApprovalFor:
    - "mcp.*.terminal"        # Any terminal tool
    - "mcp.*.file_write"      # Any file write
    - "mcp.github.create_*"   # GitHub create operations
```

### Per-Agent Tool Allowlist
Agents only access tools in their `tools` array:
```typescript
const sub = new SubAgent({
  tools: ["file_read", "mcp.filesystem.read_file"]  // Cannot call mcp.github.*
}, memory);
```

### Secret References
Never hardcode secrets — use `${VAR_NAME}`:
```yaml
headers:
  Authorization: "Bearer ${GITHUB_TOKEN}"
```
Resolved from environment at config load time.

## Tool Namespacing

MCP tools are prefixed to avoid collisions:
- Server: `filesystem`, Tool: `read_file` → `mcp.filesystem.read_file`
- Server: `github`, Tool: `create_issue` → `mcp.github.create_issue`

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ToolRegistry                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ file_read   │  │ file_write  │  │ mcp.filesystem.read │  │
│  │ (built-in)  │  │ (built-in)  │  │ mcp.github.create   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                          ▲
                          │ registers
┌─────────────────────────┴──────────────────────────────────┐
│                       MCPClient                               │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ StdioTransport│  │ SseTransport │  │ WebSocketTransport  │  │
│  │ (filesystem)  │  │ (github)     │  │ (future)            │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Troubleshooting

### Server Won't Connect
```bash
# Check status
harness mcp status filesystem

# Common issues:
# 1. Command not in allowlist → add to approvedCommands
# 2. Secret not set → export VAR_NAME=value
# 3. Server not installed → npx -y @modelcontextprotocol/server-filesystem
```

### Tools Not Appearing
```bash
# Verify connection
harness mcp list
# If status is "error", check logs

# Refresh tools
harness mcp status filesystem --refresh
```

### Permission Denied
- Check `security.requireApprovalFor` patterns
- Check agent's `tools` allowlist
- In CI: set `HARNESS_AUTO_APPROVE=true` to bypass gates

## Example Workflow

```json
{
  "id": "mcp-demo",
  "name": "MCP Demo Workflow",
  "tasks": [
    {
      "id": "read-config",
      "name": "Read Config via MCP",
      "description": "Use filesystem MCP server to read a config file",
      "acceptanceCriteria": ["File content retrieved"],
      "priority": "P1",
      "dependencies": []
    },
    {
      "id": "create-issue",
      "name": "Create GitHub Issue via MCP",
      "description": "Use GitHub MCP server to create an issue",
      "acceptanceCriteria": ["Issue created with correct title"],
      "priority": "P1",
      "dependencies": ["read-config"]
    }
  ]
}
```

Run with:
```bash
harness run mcp-demo.json
```

## Next Steps

- Explore [MCP Server Registry](https://github.com/modelcontextprotocol/servers) for 1000+ servers
- Read [Security Guide](./security.md) for production hardening
- Check [Architecture Docs](../architecture.md) for integration details