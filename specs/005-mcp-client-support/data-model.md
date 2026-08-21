# Data Model: MCP Client Support

## Core Entities

### MCPServerConfig
```typescript
interface MCPServerConfig {
  name: string;                    // Unique identifier, used in tool namespace
  transport: 'stdio' | 'sse' | 'websocket';
  enabled: boolean;                // Default: true
  
  // stdio transport
  command?: string;                // Executable (e.g., "npx", "uvx", "python")
  args?: string[];                 // Command arguments
  env?: Record<string, string>;    // Additional environment variables
  approvedCommands?: string[];     // Allowlist for command (security)
  
  // sse/websocket transport
  url?: string;                    // Server endpoint URL
  headers?: Record<string, string>; // HTTP headers (supports ${SECRET_REF})
  tlsPinning?: boolean;            // Default: false
  allowedOrigins?: string[];       // Origin allowlist for WS/SSE
  
  // Connection behavior
  reconnect: boolean;              // Default: true
  reconnectIntervalMs: number;     // Default: 5000
  timeoutMs: number;               // Default: 30000
}
```

### MCPConnection
```typescript
interface MCPConnection {
  config: MCPServerConfig;
  status: 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';
  transport: MCPTransport;
  tools: MCPTool[];
  connectedAt?: Date;
  lastError?: Error;
  lastHealthCheck?: Date;
  healthCheckInterval?: NodeJS.Timeout;
}
```

### MCPTransport (Interface)
```typescript
interface MCPTransport {
  readonly type: 'stdio' | 'sse' | 'websocket';
  
  connect(config: MCPServerConfig): Promise<void>;
  disconnect(): Promise<void>;
  request(method: string, params?: unknown): Promise<unknown>;
  notify(method: string, params?: unknown): Promise<void>;
  onClose: (callback: (reason?: Error) => void) => void;
  onError: (callback: (error: Error) => void) => void;
}
```

### MCPTool
```typescript
interface MCPTool {
  name: string;                    // Original tool name from server
  namespacedName: string;          // "mcp.{server}.{tool}" 
  description: string;
  inputSchema: JSONSchema;         // MCP tool inputSchema (JSON Schema)
  serverName: string;              // Origin server
  
  // Execution
  call(arguments: unknown): Promise<ToolResult>;
}
```

### MCPSecurityPolicy
```typescript
interface MCPSecurityPolicy {
  // Global settings
  requireApprovalFor: string[];          // Tool name patterns requiring approval
  sandboxStdio: boolean;                 // Default: true
  maxConcurrentConnections: number;      // Default: 10
  allowedSchemas?: string[];             // Optional schema allowlist patterns
  
  // Per-server overrides (keyed by server name)
  serverOverrides?: Record<string, {
    requireApprovalFor?: string[];
    allowedCommands?: string[];
    allowedOrigins?: string[];
  }>;
}
```

### ToolResult (Existing - Extended)
```typescript
// From types.ts - ToolResult already matches MCP tool result shape
interface ToolResult {
  success: boolean;
  output?: unknown;
  error?: string;
}
```

### HarnessConfig Extension
```typescript
// Added to HarnessConfigSchema
interface HarnessConfig {
  // ... existing fields
  mcp: {
    servers: MCPServerConfig[];
    security: MCPSecurityPolicy;
  };
}
```

## State Transitions

### MCPConnection Lifecycle
```
DISCONNECTED
    │
    ▼ (connect called)
CONNECTING ──error──▶ ERROR
    │                    │
    │ success            │ (reconnect enabled)
    ▼                    │
CONNECTED ──error──▶ RECONNECTING ──success──▶ CONNECTED
    │                    │
    │ (disconnect)       │ (reconnect failed)
    ▼                    ▼
DISCONNECTED ◀────────── ERROR
```

### Tool Registration Flow
```
MCPServerConfig
    │
    ▼
MCPClient.connect()
    │
    ▼
MCPTransport.connect() ───▶ MCP initialize handshake
    │
    ▼
tools/list request
    │
    ▼
For each tool:
  1. Validate inputSchema (JSON Schema)
  2. Create namespacedName = `mcp.${serverName}.${toolName}`
  3. Check collision in ToolRegistry
  4. Create MCPTool wrapper with call() → transport.request('tools/call', ...)
  5. Register in ToolRegistry
  6. Add to connection.tools[]
    │
    ▼
Return Tool[] to caller
```

## Config Schema (Zod)

```typescript
// src/config/schema.ts additions

const MCPServerConfigSchema = z.object({
  name: z.string().min(1),
  transport: z.enum(['stdio', 'sse', 'websocket']),
  enabled: z.boolean().default(true),
  
  // stdio
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).default({}),
  approvedCommands: z.array(z.string()).optional(),
  
  // sse/ws
  url: z.string().url().optional(),
  headers: z.record(z.string()).default({}),
  tlsPinning: z.boolean().default(false),
  allowedOrigins: z.array(z.string()).default([]),
  
  // behavior
  reconnect: z.boolean().default(true),
  reconnectIntervalMs: z.number().int().positive().default(5000),
  timeoutMs: z.number().int().positive().default(30000),
}).refine((data) => {
  // Validate transport-specific required fields
  if (data.transport === 'stdio') {
    return data.command !== undefined;
  }
  if (data.transport === 'sse' || data.transport === 'websocket') {
    return data.url !== undefined;
  }
  return true;
}, {
  message: 'stdio requires command; sse/websocket requires url',
  path: ['transport'],
});

const MCPSecurityPolicySchema = z.object({
  requireApprovalFor: z.array(z.string()).default([]),
  sandboxStdio: z.boolean().default(true),
  maxConcurrentConnections: z.number().int().positive().default(10),
  allowedSchemas: z.array(z.string()).optional(),
  serverOverrides: z.record(z.object({
    requireApprovalFor: z.array(z.string()).optional(),
    allowedCommands: z.array(z.string()).optional(),
    allowedOrigins: z.array(z.string()).optional(),
  })).optional(),
});

const MCPConfigSchema = z.object({
  servers: z.array(MCPServerConfigSchema).default([]),
  security: MCPSecurityPolicySchema.default({}),
});

// Extend HarnessConfigSchema
export const HarnessConfigSchema = z.object({
  // ... existing
  mcp: MCPConfigSchema.default({}),
});
```

## Secret Reference Resolution

```typescript
// In config/loader.ts
function resolveSecretRefs(obj: unknown, env: Record<string, string>): unknown {
  if (typeof obj === 'string') {
    // Match ${VAR_NAME} or ${VAR_NAME:-default}
    return obj.replace(/\$\{([A-Z0-9_]+)(?::-([^}]*))?\}/g, (_, varName, defaultVal) => {
      return env[varName] ?? defaultVal ?? '';
    });
  }
  if (Array.isArray(obj)) return obj.map(v => resolveSecretRefs(v, env));
  if (obj && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      result[k] = resolveSecretRefs(v, env);
    }
    return result;
  }
  return obj;
}
```

## Example Config

```yaml
# harness.config.yaml
mcp:
  servers:
    - name: "filesystem"
      transport: "stdio"
      command: "npx"
      args: ["-y", "@modelcontextprotocol/server-filesystem", "${WORKSPACE_ROOT}"]
      env:
        NODE_ENV: "production"
      approvedCommands: ["npx", "uvx"]
      reconnect: true
      reconnectIntervalMs: 5000
      
    - name: "github"
      transport: "sse"
      url: "https://api.githubcopilot.com/mcp"
      headers:
        Authorization: "Bearer ${GITHUB_COPILOT_TOKEN}"
        Accept: "application/json, text/event-stream"
      tlsPinning: true
      allowedOrigins: ["api.githubcopilot.com"]
      reconnect: true
      
    - name: "postgres"
      transport: "stdio"
      command: "uvx"
      args: ["mcp-server-postgres", "${DATABASE_URL}"]
      approvedCommands: ["uvx"]
      
  security:
    requireApprovalFor:
      - "mcp.*.terminal"
      - "mcp.*.file_write"
      - "mcp.github.*"
    sandboxStdio: true
    maxConcurrentConnections: 10
    serverOverrides:
      github:
        requireApprovalFor:
          - "mcp.github.create_repository"
          - "mcp.github.delete_*"
```

## JSON-RPC Message Shapes (MCP Protocol)

### Initialize
```json
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {}
    },
    "clientInfo": {
      "name": "multi-agent-harness",
      "version": "0.1.0"
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": { "listChanged": true },
      "resources": {},
      "prompts": {}
    },
    "serverInfo": {
      "name": "filesystem",
      "version": "1.0.0"
    }
  }
}
```

### Tools List
```json
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "read_file",
        "description": "Read a file from the filesystem",
        "inputSchema": {
          "type": "object",
          "properties": {
            "path": { "type": "string", "description": "File path" }
          },
          "required": ["path"]
        }
      }
    ]
  }
}
```

### Tools Call
```json
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "read_file",
    "arguments": { "path": "/home/user/file.txt" }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      { "type": "text", "text": "File contents here..." }
    ],
    "isError": false
  }
}
```