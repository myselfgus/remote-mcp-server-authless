# Meta-MCP Server - Technical Architecture

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Cloudflare Infrastructure](#cloudflare-infrastructure)
4. [Component Details](#component-details)
5. [Data Flow](#data-flow)
6. [Database Schema](#database-schema)
7. [Service Bindings](#service-bindings)
8. [Container Management](#container-management)
9. [Security Architecture](#security-architecture)
10. [Performance & Scalability](#performance--scalability)

## Overview

The Meta-MCP Server is a sophisticated serverless application built on Cloudflare Workers that enables dynamic creation, deployment, and management of other MCP (Model Context Protocol) servers. It leverages multiple Cloudflare services to provide a complete platform-as-a-service experience.

### Key Capabilities

- **Dynamic Server Generation**: Creates fully-functional MCP servers from descriptions
- **Containerized Build Environment**: Isolated SDK environments for each server
- **Automated Deployment**: Direct deployment to Cloudflare Workers network
- **Persistent State**: Uses Durable Objects and D1 for reliable storage
- **Service Orchestration**: Coordinates multiple Cloudflare services via RPC

### Technology Stack

- **Runtime**: Cloudflare Workers (V8 isolates)
- **Language**: TypeScript 5.9.2
- **MCP SDK**: @modelcontextprotocol/sdk 1.17.3
- **Agent Framework**: agents ^0.0.113
- **Validation**: Zod ^3.25.76
- **Build Tool**: Wrangler ^4.33.1
- **Code Quality**: Biome ^2.2.2

## System Architecture

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Client Layer                             │
│  (Claude Desktop, Claude.ai, AI Playground, mcp-remote)     │
└────────────────────────────┬─────────────────────────────────┘
                             │ SSE/HTTP
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                   Cloudflare Workers                         │
│                                                              │
│  ┌────────────────────────────────────────────────────┐    │
│  │         MetaMCP Durable Object                     │    │
│  │  - 22 MCP Tools                                    │    │
│  │  - State Management                                │    │
│  │  - Request Routing                                 │    │
│  └──────────┬──────────────────────────┬──────────────┘    │
│             │                           │                   │
│             ↓                           ↓                   │
│  ┌──────────────────┐      ┌──────────────────┐          │
│  │   SQL Storage    │      │   Binary Storage │          │
│  │   (D1 Database)  │      │   (KV + R2)      │          │
│  └──────────────────┘      └──────────────────┘          │
└────────────────────────────┬─────────────────────────────────┘
                             │ Service Bindings (RPC)
                             ↓
┌──────────────────────────────────────────────────────────────┐
│                  Service Bindings Layer                      │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│  │ CONTAINER_   │  │  WORKER_     │  │   MCP_       │    │
│  │  MANAGER     │  │  PUBLISHER   │  │  CLIENT      │    │
│  └──────────────┘  └──────────────┘  └──────────────┘    │
└──────────────────────────┬───────────────────────────────────┘
                           │
                           ↓
┌──────────────────────────────────────────────────────────────┐
│              Deployed MCP Servers (Workers)                  │
│  Each with: Durable Object + SSE endpoint + Tools            │
└──────────────────────────────────────────────────────────────┘
```

### Component Layers

#### Layer 1: Client Interface
- **MCP Protocol**: Server-Sent Events (SSE) and HTTP POST
- **Endpoints**: 
  - `/sse` - SSE transport for real-time communication
  - `/sse/message` - Message submission endpoint
  - `/mcp` - HTTP POST transport
  - `/health` - Health check endpoint

#### Layer 2: Core Application (MetaMCP)
- **Durable Object**: Stateful singleton instance per namespace
- **MCP Server Instance**: Handles MCP protocol communication
- **Tool Handlers**: 22 specialized tools for server management
- **State Manager**: Tracks system state and statistics

#### Layer 3: Storage Layer
- **D1 Database**: Relational storage for server configs and metadata
- **KV Namespace**: Key-value store for caching and quick lookups
- **R2 Bucket**: Object storage for large files and artifacts

#### Layer 4: Service Orchestration
- **Container Manager**: Manages SDK environments and builds
- **Worker Publisher**: Handles deployment to Workers namespace
- **MCP Client**: Connects to external MCP servers

#### Layer 5: Deployed Servers
- **Generated Workers**: Dynamically created MCP servers
- **Isolated Execution**: Each server runs in its own Worker
- **Global Distribution**: Deployed to Cloudflare's edge network

## Cloudflare Infrastructure

### Durable Objects

**Purpose**: Provide consistent, stateful storage with strong consistency.

**MetaMCP Durable Object**:
```typescript
export class MetaMCP extends McpAgent<Env, MetaMCPState> {
  server = new McpServer({
    name: "MCP Remote Server Builder",
    version: "1.0.0",
  });
  
  initialState: MetaMCPState = {
    totalServers: 0,
    totalTools: 0,
    // ... other state
  };
}
```

**Features**:
- Single instance per namespace ensures consistency
- Automatic persistence across requests
- Built-in SQLite for structured data
- WebSocket/SSE support for real-time updates

**Configuration** (wrangler.jsonc):
```json
{
  "migrations": [
    {
      "new_sqlite_classes": ["MetaMCP"],
      "tag": "v1"
    }
  ],
  "durable_objects": {
    "bindings": [
      {
        "class_name": "MetaMCP",
        "name": "MCP_OBJECT"
      }
    ]
  }
}
```

### D1 Database

**Purpose**: SQL database for structured, queryable data.

**Connection**:
```json
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "meta-mcp-db",
      "database_id": "8dc4c0f5-7f82-4ed2-8501-be0b95a4fa38"
    }
  ]
}
```

**Usage Pattern**:
```typescript
// Query with prepared statements
const result = await this.env.DB.prepare(`
  SELECT * FROM mcp_servers WHERE id = ?
`).bind(serverId).first();

// Transactions for consistency
await this.env.DB.batch([
  this.env.DB.prepare(`INSERT INTO mcp_servers ...`),
  this.env.DB.prepare(`INSERT INTO mcp_tools ...`)
]);
```

**Advantages**:
- SQL interface for complex queries
- ACID transactions
- Automatic replication
- Low latency (co-located with Workers)

### KV Namespace

**Purpose**: Fast, eventually-consistent key-value storage.

**Connection**:
```json
{
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "a1afcfa24f9a4cd2a135117098493a49"
    }
  ]
}
```

**Usage Pattern**:
```typescript
// Store with TTL
await this.env.KV.put(
  `cache:${key}`,
  JSON.stringify(data),
  { expirationTtl: 3600 } // 1 hour
);

// Retrieve
const cached = await this.env.KV.get(`cache:${key}`, "json");
```

**Use Cases**:
- Caching API responses
- Session storage
- Configuration snapshots
- Quick lookups

### R2 Bucket

**Purpose**: S3-compatible object storage for large files.

**Connection**:
```json
{
  "r2_buckets": [
    {
      "binding": "STORAGE",
      "bucket_name": "meta-mcp-storage"
    }
  ]
}
```

**Usage Pattern**:
```typescript
// Store file
await this.env.STORAGE.put(
  `builds/${serverId}/index.ts`,
  fileContent,
  {
    httpMetadata: {
      contentType: "text/typescript"
    }
  }
);

// Retrieve file
const object = await this.env.STORAGE.get(`builds/${serverId}/index.ts`);
const content = await object.text();
```

**Use Cases**:
- Source code storage
- Build artifacts
- Container images
- Large configuration files

### Dispatch Namespace

**Purpose**: Route requests to dynamically created Workers.

**Connection**:
```json
{
  "dispatch_namespaces": [
    {
      "binding": "DISPATCHER",
      "namespace": "meta-mcp",
      "outbound": {
        "service": "meta-mcp"
      }
    }
  ]
}
```

**Use Cases**:
- Dynamic routing to created servers
- Multi-tenant isolation
- Namespace-based access control

## Component Details

### MetaMCP Durable Object

**File**: `src/index.ts`

**Responsibilities**:
1. MCP protocol handling
2. Tool execution
3. State management
4. Service coordination
5. Database operations

**Key Methods**:

```typescript
class MetaMCP extends McpAgent<Env, MetaMCPState> {
  // Lifecycle
  async init(): Promise<void>
  
  // State
  onStateUpdate(state: MetaMCPState, source: Connection | "server"): void
  
  // Database
  private async initializeDatabase(): Promise<void>
  private async getServerFromDB(serverId: string): Promise<MCPServerConfig | null>
  private async saveServerToDB(serverId: string, config: MCPServerConfig): Promise<void>
  private async deleteServerFromDB(serverId: string): Promise<boolean>
  private async listServersFromDB(): Promise<MCPServerConfig[]>
  
  // Code generation
  private generateIndexTs(config: MCPServerConfig): string
  private generateWranglerConfig(config: MCPServerConfig): string
  private generatePackageJson(config: MCPServerConfig): string
  
  // Utilities
  private toPascalCase(str: string): string
}
```

**State Interface**:

```typescript
interface MetaMCPState {
  // Statistics
  totalServers: number;
  totalTools: number;
  totalResources: number;
  totalPrompts: number;
  
  // Activity
  lastServerCreated: { name: string; timestamp: number } | null;
  lastServerUpdated: { name: string; timestamp: number } | null;
  lastServerDeleted: { name: string; timestamp: number } | null;
  
  // Cleanup
  pendingCleanupRequests: number;
  lastCleanupRun: number | null;
  nextScheduledCleanup: number | null;
  
  // Connections
  connectedMCPServers: Array<{
    name: string;
    url: string;
    status: "connected" | "disconnected" | "error";
    lastSync: number;
  }>;
  
  // Health
  databaseHealth: "healthy" | "degraded" | "error";
  lastHealthCheck: number;
}
```

### MetaMCPRPC Class

**File**: `src/rpc.ts`

**Purpose**: Programmatic API for external service integration.

**Methods**:

```typescript
export class MetaMCPRPC extends WorkerEntrypoint<Env> {
  // Create and deploy in one operation
  async createServer(
    name: string,
    description: string,
    tools: Array<ToolDefinition>
  ): Promise<Result>
  
  // List all servers
  async listServers(
    limit: number,
    offset: number
  ): Promise<ServerList>
  
  // Get status
  async getServerStatus(serverId: string): Promise<ServerStatus>
  
  // Connect to deployed server
  async connectToServer(serverId: string): Promise<Connection>
  
  // Stop server
  async stopServer(
    serverId: string,
    deleteFromNamespace: boolean
  ): Promise<Result>
}
```

**Usage Example**:

```typescript
// From another Worker
const result = await env.META_MCP.createServer(
  "my-api",
  "Custom API server",
  [
    {
      name: "get_data",
      description: "Fetch data",
      inputSchema: { type: "object", properties: { id: { type: "string" } } },
      handler: "async (params) => { /* implementation */ }"
    }
  ]
);
```

## Data Flow

### Server Creation Flow

```
User Request → MetaMCP.init_mcp_server()
                      ↓
              1. Validate name
                      ↓
              2. Create DB record (status: 'creating')
                      ↓
              3. Call CONTAINER_MANAGER.createSDKEnvironment()
                      ↓
              4. Initialize container with SDK packages
                      ↓
              5. Update DB (status: 'draft', store container_id)
                      ↓
              6. Return success with container info
```

### Tool Addition Flow

```
User Request → MetaMCP.add_mcp_tool()
                      ↓
              1. Validate server exists
                      ↓
              2. Generate Zod schema from parameters
                      ↓
              3. Generate tool code with try-catch
                      ↓
              4. Call CONTAINER_MANAGER.addToolToServer()
                      ↓
              5. Write tool code to container workspace
                      ↓
              6. Update D1 with tool definition
                      ↓
              7. Update state (totalTools++)
                      ↓
              8. Return success
```

### Deployment Flow

```
User Request → MetaMCP.wrangler_deploy()
                      ↓
              1. Update status to 'building'
                      ↓
              2. Call CONTAINER_MANAGER.buildMCPServer()
                      ↓
              3. Container compiles TypeScript
                      ↓
              4. Bundle with dependencies
                      ↓
              5. Return compiled script
                      ↓
              6. Update status to 'deploying'
                      ↓
              7. Call WORKER_PUBLISHER.deployFromMetaMCP()
                      ↓
              8. Publish to Workers namespace
                      ↓
              9. Generate deployment URL
                      ↓
             10. Update status to 'active'
                      ↓
             11. Store deployment metadata
                      ↓
             12. Return deployment URL + SSE endpoint
```

### Tool Execution Flow (Client → Deployed Server)

```
Client → https://server.workers.dev/sse → CONNECT
                                               ↓
                                    Establish SSE connection
                                               ↓
Client sends → tools/call → {"name": "get_data", "arguments": {...}}
                                               ↓
                                    Server.tool() handler
                                               ↓
                                    Execute implementation
                                               ↓
                                    Validate with Zod
                                               ↓
                                    Return result
                                               ↓
Client receives ← tools/call/result ← {"content": [...]}
```

## Database Schema

### Table: mcp_servers

**Purpose**: Store MCP server configurations.

```sql
CREATE TABLE mcp_servers (
  id TEXT PRIMARY KEY,                    -- Server ID (same as name)
  name TEXT NOT NULL UNIQUE,              -- Server name
  version TEXT NOT NULL,                  -- Semantic version
  description TEXT NOT NULL,              -- Server description
  status TEXT DEFAULT 'draft',            -- draft|creating|building|deploying|active|failed|stopped
  worker_name TEXT,                       -- Deployed worker name
  container_id TEXT,                      -- Container ID for builds
  metadata TEXT,                          -- JSON: { containerCreated, workspacePath, etc. }
  created_at INTEGER NOT NULL,            -- Unix timestamp
  updated_at INTEGER NOT NULL,            -- Unix timestamp
  wrangler_config TEXT NOT NULL           -- JSON: Wrangler configuration
);

CREATE INDEX idx_mcp_servers_updated ON mcp_servers(updated_at);
```

### Table: mcp_tools

**Purpose**: Store tool definitions for each server.

```sql
CREATE TABLE mcp_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,                -- Foreign key to mcp_servers.id
  name TEXT NOT NULL,                     -- Tool name
  description TEXT NOT NULL,              -- Tool description
  parameters TEXT NOT NULL,               -- JSON: Parameter definitions
  implementation TEXT NOT NULL,           -- JavaScript implementation code
  handler_code TEXT,                      -- Alternative handler format (RPC)
  created_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
  UNIQUE(server_id, name)
);

CREATE INDEX idx_mcp_tools_server_id ON mcp_tools(server_id);
```

### Table: mcp_resources

**Purpose**: Store resource definitions.

```sql
CREATE TABLE mcp_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  uri TEXT NOT NULL,                      -- Resource URI
  name TEXT NOT NULL,                     -- Resource name
  description TEXT NOT NULL,
  mime_type TEXT NOT NULL,                -- Content type
  implementation TEXT NOT NULL,           -- JavaScript to generate content
  created_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
  UNIQUE(server_id, uri)
);

CREATE INDEX idx_mcp_resources_server_id ON mcp_resources(server_id);
```

### Table: mcp_prompts

**Purpose**: Store prompt templates.

```sql
CREATE TABLE mcp_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id TEXT NOT NULL,
  name TEXT NOT NULL,                     -- Prompt name
  description TEXT NOT NULL,
  arguments TEXT NOT NULL,                -- JSON: Argument definitions
  template TEXT NOT NULL,                 -- Template with {{placeholders}}
  created_at INTEGER NOT NULL,
  FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
  UNIQUE(server_id, name)
);

CREATE INDEX idx_mcp_prompts_server_id ON mcp_prompts(server_id);
```

### Table: cleanup_requests

**Purpose**: Track cleanup operations requiring confirmation.

```sql
CREATE TABLE cleanup_requests (
  id TEXT PRIMARY KEY,
  requested_at INTEGER NOT NULL,
  servers_to_delete TEXT NOT NULL,        -- JSON: Array of server IDs
  status TEXT NOT NULL,                   -- pending|approved|rejected
  responded_at INTEGER
);

CREATE INDEX idx_cleanup_status ON cleanup_requests(status, requested_at);
```

### Table: mcp_client_connections

**Purpose**: Track connections to external MCP servers.

```sql
CREATE TABLE mcp_client_connections (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,              -- Connection name
  url TEXT NOT NULL,                      -- Server URL
  status TEXT NOT NULL,                   -- connected|disconnected|error
  last_sync INTEGER NOT NULL,             -- Last successful sync
  capabilities TEXT,                      -- JSON: Server capabilities
  tools_count INTEGER DEFAULT 0,
  resources_count INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_mcp_connections_status ON mcp_client_connections(status);
```

### Table: worker_deployments

**Purpose**: Track deployed workers (managed by WORKER_PUBLISHER).

```sql
CREATE TABLE worker_deployments (
  id TEXT PRIMARY KEY,
  worker_name TEXT NOT NULL UNIQUE,
  server_id TEXT NOT NULL,
  deployment_url TEXT NOT NULL,
  status TEXT NOT NULL,                   -- deploying|active|stopped|failed
  script_content TEXT NOT NULL,           -- Deployed code
  deployed_at INTEGER NOT NULL,
  metadata TEXT                           -- JSON: Deployment metadata
);
```

## Service Bindings

### CONTAINER_MANAGER Binding

**Purpose**: Manages containerized build environments.

**Service Configuration**:
```json
{
  "binding": "CONTAINER_MANAGER",
  "service": "containers-manager",
  "environment": "production",
  "entrypoint": "ContainerManagerRPC"
}
```

**RPC Methods**:

```typescript
interface ContainerManagerRPC {
  // Create SDK environment with npm packages
  createSDKEnvironment(
    serverId: string,
    packages: string[]
  ): Promise<{
    success: boolean;
    containerId: string;
    workspacePath: string;
    template: string;
    sdks: string[];
    error?: string;
  }>;
  
  // Add tool code to server workspace
  addToolToServer(
    containerId: string,
    serverId: string,
    toolName: string,
    toolCode: string
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }>;
  
  // Add resource code
  addResourceToServer(
    containerId: string,
    serverId: string,
    resourceCode: string
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }>;
  
  // Add prompt code
  addPromptToServer(
    containerId: string,
    serverId: string,
    promptCode: string
  ): Promise<{
    success: boolean;
    message: string;
    error?: string;
  }>;
  
  // Build complete MCP server
  buildMCPServer(
    containerId: string,
    serverId: string,
    codeFiles: { [filename: string]: string }
  ): Promise<{
    success: boolean;
    scriptContent: string;
    error?: string;
  }>;
  
  // Container operations
  execCommand(
    containerId: string,
    command: string,
    timeout: number
  ): Promise<{
    success: boolean;
    output: string;
  }>;
  
  writeFile(
    containerId: string,
    path: string,
    content: string
  ): Promise<{
    success: boolean;
    content: string;
  }>;
  
  readFile(
    containerId: string,
    path: string
  ): Promise<{
    success: boolean;
    content: string;
  }>;
}
```

### WORKER_PUBLISHER Binding

**Purpose**: Deploys Workers to Cloudflare namespace.

**Service Configuration**:
```json
{
  "binding": "WORKER_PUBLISHER",
  "service": "worker-publisher",
  "environment": "production",
  "entrypoint": "WorkerPublisherRPC"
}
```

**RPC Methods**:

```typescript
interface WorkerPublisherRPC {
  // Deploy from Meta-MCP
  deployFromMetaMCP(
    serverId: string,
    workerName: string,
    scriptContent: string
  ): Promise<{
    success: boolean;
    deploymentUrl: string;
    workerName: string;
    error?: string;
  }>;
  
  // Delete deployment
  deleteDeployment(
    deploymentId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  
  // Update deployment
  updateDeployment(
    deploymentId: string,
    scriptContent: string
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  
  // Get deployment status
  getDeploymentStatus(
    deploymentId: string
  ): Promise<{
    success: boolean;
    status: string;
    url: string;
    error?: string;
  }>;
}
```

### MCP_CLIENT Binding

**Purpose**: Connect to external MCP servers as a client.

**Service Configuration**:
```json
{
  "binding": "MCP_CLIENT",
  "service": "mcp-client",
  "environment": "production",
  "entrypoint": "MCPClientRPC"
}
```

**RPC Methods**:

```typescript
interface MCPClientRPC {
  // Connect to server
  connectToServer(
    connectionId: string,
    serverUrl: string,
    serverName: string
  ): Promise<{
    success: boolean;
    connectionId: string;
    tools: Array<{ name: string; description: string }>;
    error?: string;
  }>;
  
  // Call tool on connected server
  callTool(
    connectionId: string,
    toolName: string,
    arguments: Record<string, any>
  ): Promise<{
    success: boolean;
    result: any;
    error?: string;
  }>;
  
  // Disconnect
  disconnect(
    connectionId: string
  ): Promise<{
    success: boolean;
    error?: string;
  }>;
  
  // List capabilities
  getCapabilities(
    connectionId: string
  ): Promise<{
    success: boolean;
    capabilities: {
      tools: Array<Tool>;
      resources: Array<Resource>;
      prompts: Array<Prompt>;
    };
    error?: string;
  }>;
}
```

## Container Management

### Container Lifecycle

```
1. CREATE
   ↓
   createSDKEnvironment(serverId, packages)
   - Allocate container
   - Install base image (Node.js/Python)
   - npm install packages
   - Create workspace directory
   
2. DEVELOP
   ↓
   addToolToServer(containerId, toolName, code)
   - Write tool code to workspace/tools/
   - Update index.ts
   
3. BUILD
   ↓
   buildMCPServer(containerId, serverId, codeFiles)
   - Run TypeScript compiler
   - Bundle dependencies
   - Generate Worker script
   
4. DEPLOY
   ↓
   (Container can be destroyed after successful deployment)
   
5. CLEANUP
   ↓
   (Automatic garbage collection of old containers)
```

### Workspace Structure

```
/workspace/
├── package.json          # Dependencies
├── tsconfig.json         # TypeScript config
├── wrangler.jsonc        # Wrangler config
├── src/
│   ├── index.ts          # Main entry point
│   ├── tools/            # Generated tool code
│   │   ├── tool1.ts
│   │   └── tool2.ts
│   ├── resources/        # Generated resource code
│   │   └── resource1.ts
│   └── prompts/          # Generated prompt code
│       └── prompt1.ts
├── node_modules/         # Installed dependencies
└── dist/                 # Build output
    └── index.js
```

### Security Isolation

1. **Process Isolation**: Each container runs in isolated process
2. **Filesystem Isolation**: Containers can only access /workspace
3. **Network Restrictions**: Limited egress (npm registry, Cloudflare APIs)
4. **Resource Limits**:
   - CPU: Fair share scheduling
   - Memory: 512MB per container
   - Storage: 100MB per container
   - Execution timeout: 300 seconds

## Security Architecture

### Authentication & Authorization

**Cloudflare Access** (Optional):
- Dashboard-level authentication
- JWT validation handled by Cloudflare Edge
- Worker receives pre-authenticated requests
- No JWT validation needed in Worker code

**Current Configuration** (Authless):
```typescript
const accessConfig: CloudflareAccessConfig = {
  enabled: env.CF_ACCESS_ENABLED !== "false", // Default disabled
};
```

**CORS Configuration**:
```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, CF-Access-JWT-Assertion",
  "Access-Control-Max-Age": "86400",
};
```

### Input Validation

**Server Names**:
```typescript
const nameRegex = /^[a-z0-9-]+$/;
if (!nameRegex.test(name)) {
  throw new Error("Invalid name format");
}
```

**Container Paths**:
```typescript
// Only allow /workspace
if (!path.startsWith("/workspace")) {
  throw new Error("Path must be in /workspace");
}

// Block directory traversal
if (path.includes("..")) {
  throw new Error("Path traversal not allowed");
}
```

**Command Execution**:
```typescript
// Block dangerous commands
const dangerousPatterns = [
  /rm\s+-rf\s+\/(?!workspace)/,  // rm -rf / (except workspace)
  /:\(\)\{.*\}/,                  // Fork bombs
  /while\s*true/i,                // Infinite loops
];
```

### Data Protection

**Secrets Management**:
- Never store secrets in D1/KV
- Use Wrangler secrets for sensitive data
- Environment variables for config

**SQL Injection Prevention**:
```typescript
// Always use prepared statements
await this.env.DB.prepare(`
  SELECT * FROM mcp_servers WHERE id = ?
`).bind(serverId).first();

// Never concatenate user input
// ❌ BAD: `SELECT * FROM servers WHERE id = '${userId}'`
```

**XSS Prevention**:
- All tool outputs are text/plain by default
- HTML sanitization for any HTML output
- Content-Security-Policy headers

## Performance & Scalability

### Performance Characteristics

**Cold Start**: < 10ms (V8 isolate initialization)
**Warm Request**: < 1ms (in-memory)
**Database Query**: < 5ms (D1, co-located)
**KV Read**: < 1ms (edge cache hit)
**R2 Read**: < 50ms (first byte)

### Optimization Strategies

**1. Caching**:
```typescript
// Cache server configs in KV
const cached = await env.KV.get(`server:${id}`, "json");
if (cached) return cached;

// Cache with TTL
await env.KV.put(
  `server:${id}`,
  JSON.stringify(config),
  { expirationTtl: 3600 }
);
```

**2. Batch Operations**:
```typescript
// Batch DB operations
await this.env.DB.batch([
  stmt1.bind(param1),
  stmt2.bind(param2),
  stmt3.bind(param3)
]);
```

**3. Parallel Execution**:
```typescript
// Parallel service calls
const [containerResult, publishResult] = await Promise.all([
  this.env.CONTAINER_MANAGER.build(id),
  this.env.WORKER_PUBLISHER.prepare(id)
]);
```

**4. Connection Pooling**:
- Durable Objects maintain persistent connections
- Service bindings reuse connections
- No cold start penalty for RPC calls

### Scalability Limits

**Durable Objects**:
- Requests/second: 1000+ per instance
- Concurrent connections: 10,000+
- Storage: 50GB per instance

**D1 Database**:
- Queries/second: 10,000+
- Storage: 10GB (can be increased)
- Connections: Unlimited (serverless)

**Workers**:
- Requests/second: Unlimited (autoscaling)
- Memory: 128MB per request
- CPU: 50ms (free) / 50000ms (paid)

### Monitoring & Observability

**Built-in Observability**:
```json
{
  "observability": {
    "enabled": true
  }
}
```

**Custom Metrics**:
```typescript
this.emitObservabilityEvent("tool:usage", {
  tool: toolName,
  duration_ms: duration,
  success: true,
  timestamp: Date.now(),
});
```

**Health Checks**:
- `/health` endpoint for availability
- Database health tracking
- Service binding status
- Container manager connectivity

### Failure Handling

**Retry Logic**:
- Exponential backoff for service calls
- Max 3 retries for transient failures
- Circuit breaker for persistent failures

**Error Recovery**:
- Transaction rollback on DB errors
- Cleanup on deployment failure
- Container cleanup on build failure
- State recovery from D1

**Graceful Degradation**:
- Read-only mode if DB is down
- Cached responses if fresh data unavailable
- Queue operations for later processing

---

**Related Documentation**:
- [USER_MANUAL.md](USER_MANUAL.md) - Usage instructions
- [PRODUCTIVITY_GUIDE.md](PRODUCTIVITY_GUIDE.md) - Use cases and benefits
- [TOOL_SUGGESTIONS.md](TOOL_SUGGESTIONS.md) - Integration possibilities
