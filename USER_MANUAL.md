# Meta-MCP Server - User Manual

## Table of Contents

1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [Core Concepts](#core-concepts)
4. [Available Tools](#available-tools)
5. [Common Workflows](#common-workflows)
6. [Best Practices](#best-practices)
7. [Troubleshooting](#troubleshooting)

## Introduction

The Meta-MCP Server is a revolutionary tool that allows you to **create other MCP servers** using nothing but the MCP protocol itself. Think of it as a "server factory" - you describe what you want, and it builds, deploys, and manages MCP servers for you on Cloudflare Workers.

### What Makes This Special?

- **No manual coding required**: Create complete MCP servers through conversational AI
- **Instant deployment**: Your servers go live on Cloudflare's global network
- **Container-based development**: Each server gets its own isolated environment
- **Full lifecycle management**: Create, update, deploy, connect, and delete servers
- **Production-ready**: Built on enterprise-grade Cloudflare infrastructure

## Getting Started

### Prerequisites

- Access to Claude.ai, Claude Desktop, or Cloudflare AI Playground
- A Cloudflare account (for deploying your own instance)
- Basic understanding of APIs and web services

### Quick Start: Connect to Meta-MCP Server

#### Option 1: Claude.ai (Web/Mobile)

1. Open Claude.ai or the Claude mobile app
2. Go to Settings → Model Context Protocol
3. Add new server with URL:
   ```
   https://meta-mcp.voither.workers.dev/sse
   ```
4. Done! The 22 tools are now available

#### Option 2: Claude Desktop

Edit your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/claude/claude_desktop_config.json`

Add this configuration:

```json
{
  "mcpServers": {
    "meta-mcp-builder": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://meta-mcp.voither.workers.dev/sse"]
    }
  }
}
```

**Important:** Restart Claude Desktop completely after making changes.

#### Option 3: Cloudflare AI Playground

1. Visit [playground.ai.cloudflare.com](https://playground.ai.cloudflare.com/)
2. Click "Connect MCP Server"
3. Enter URL: `https://meta-mcp.voither.workers.dev/sse`
4. Start using the tools!

### Verification

Test the connection:

```bash
# Health check
curl https://meta-mcp.voither.workers.dev/health

# Expected response:
# {"status":"ok","server":"MCP Remote Server Builder","version":"1.0.0"}
```

## Core Concepts

### MCP Server Lifecycle

```
┌─────────────┐
│   DRAFT     │  ← Server created, ready for tools
└──────┬──────┘
       │ add tools/resources/prompts
       ↓
┌─────────────┐
│  BUILDING   │  ← Container compiling code
└──────┬──────┘
       │
       ↓
┌─────────────┐
│ DEPLOYING   │  ← Pushing to Cloudflare Workers
└──────┬──────┘
       │
       ↓
┌─────────────┐
│   ACTIVE    │  ← Server live and accepting requests
└─────────────┘
```

### Key Components

1. **Tools**: Actions your MCP server can perform (like API calls, data processing)
2. **Resources**: Data your server can provide (like configs, documentation)
3. **Prompts**: Reusable prompt templates with variables
4. **Container**: Isolated environment where your server code runs
5. **Worker**: The deployed Cloudflare Worker hosting your server

### Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              Meta-MCP Server                    │
│  (Durable Object + D1 + KV + R2)               │
└───────┬────────────────────────────────┬────────┘
        │                                │
        ↓                                ↓
┌──────────────────┐          ┌──────────────────┐
│ Container Manager│          │ Worker Publisher │
│ (SDK + Build)    │          │ (Deploy)         │
└──────────────────┘          └──────────────────┘
        │                                │
        └────────────┬───────────────────┘
                     ↓
              ┌──────────────┐
              │ Your MCP     │
              │ Server       │
              │ (Deployed)   │
              └──────────────┘
```

## Available Tools

### Server Management (Tools 1-10)

#### 1. `init_mcp_server`

**Purpose**: Create a new MCP server with container environment.

**Parameters**:
- `name` (string, required): Server name (lowercase, alphanumeric, hyphens only)
- `version` (string, optional): Version number (default: "1.0.0")
- `description` (string, required): What your server does

**Example**:
```
Create an MCP server named "weather-api" version "1.0.0" that provides weather information for cities worldwide
```

**Output**: Server ID, container ID, workspace path, and next steps.

#### 2. `add_mcp_tool`

**Purpose**: Add a tool (function/action) to your server.

**Parameters**:
- `serverId` (string): Server ID from init_mcp_server
- `toolName` (string): Tool name (e.g., "get_weather")
- `description` (string): What the tool does
- `parameters` (object): Input parameters with types:
  ```json
  {
    "city": {
      "type": "string",
      "description": "City name",
      "optional": false
    },
    "units": {
      "type": "string",
      "description": "celsius or fahrenheit",
      "default": "celsius",
      "optional": true
    }
  }
  ```
- `implementation` (string): JavaScript code:
  ```javascript
  const { city, units = 'celsius' } = params;
  const response = await fetch(`https://api.weather.com/v1/${city}?units=${units}`);
  const data = await response.json();
  return {
    content: [{
      type: "text",
      text: JSON.stringify(data, null, 2)
    }]
  };
  ```

**Example**:
```
Add a tool to weather-api called "get_current_weather" that takes a city name and returns current temperature and conditions
```

#### 3. `add_mcp_resource`

**Purpose**: Add a resource (readable data) to your server.

**Parameters**:
- `serverId` (string): Server ID
- `uri` (string): Resource URI (e.g., "weather://config")
- `name` (string): Resource name
- `description` (string): What the resource provides
- `mimeType` (string): Content type (default: "text/plain")
- `implementation` (string): Code to generate content:
  ```javascript
  const config = {
    apiVersion: "v1",
    endpoints: { current: "/weather/current" }
  };
  return JSON.stringify(config, null, 2);
  ```

**Example**:
```
Add a resource to weather-api at "weather://config" that provides API configuration in JSON format
```

#### 4. `add_mcp_prompt`

**Purpose**: Add a prompt template to your server.

**Parameters**:
- `serverId` (string): Server ID
- `promptName` (string): Prompt name
- `description` (string): What the prompt does
- `arguments` (array): Template variables:
  ```json
  [
    {
      "name": "city",
      "description": "City to analyze",
      "required": true
    }
  ]
  ```
- `template` (string): Template with `{{variable}}` placeholders:
  ```
  Analyze the weather in {{city}} and provide a 3-day forecast with recommendations for outdoor activities.
  ```

**Example**:
```
Add a prompt to weather-api called "forecast_analysis" that takes a city and generates a detailed weather analysis
```

#### 5. `configure_wrangler`

**Purpose**: Configure deployment settings (advanced).

**Parameters**:
- `serverId` (string): Server ID
- `routes` (array, optional): Custom routes for the worker
- `vars` (object, optional): Environment variables
- `compatibilityDate` (string, optional): Cloudflare compatibility date

**Example**:
```
Configure weather-api with environment variable API_KEY set to "secret123"
```

#### 6. `get_mcp_server_code`

**Purpose**: View generated source code for your server.

**Parameters**:
- `serverId` (string): Server ID
- `fileType` (enum): What to generate
  - `"index"`: Main TypeScript file
  - `"wrangler"`: Wrangler config
  - `"package"`: package.json
  - `"all"`: All files

**Example**:
```
Show me the complete generated code for weather-api
```

#### 7. `list_mcp_servers`

**Purpose**: List all your created servers.

**Parameters**: None

**Output**: List with name, version, status, tool/resource/prompt counts, deployment info, and last update time.

**Example**:
```
List all my MCP servers
```

#### 8. `delete_mcp_server`

**Purpose**: Delete a server (stops deployment if active).

**Parameters**:
- `serverId` (string): Server ID to delete

**Warning**: This action cannot be undone!

**Example**:
```
Delete the weather-api server
```

#### 9. `get_mcp_server_details`

**Purpose**: View complete details of a server.

**Parameters**:
- `serverId` (string): Server ID

**Output**: Full server configuration including all tools, resources, prompts, and metadata.

**Example**:
```
Show me detailed information about weather-api
```

#### 10. `get_deployment_instructions`

**Purpose**: Get connection instructions for a server.

**Parameters**:
- `serverId` (string): Server ID

**Output**: Deployment URL, connection instructions for Claude Desktop, available tools, and next steps.

**Example**:
```
How do I connect to weather-api?
```

### Maintenance Tools (Tools 11-14)

#### 11. `cleanup_old_servers`

**Purpose**: Find and delete servers not updated recently.

**Parameters**:
- `daysThreshold` (number): Delete servers older than X days (default: 30)
- `dryRun` (boolean): Preview without deleting (default: false)

**Example**:
```
Show me servers older than 60 days (dry run)
```

#### 12. `connect_to_mcp_server`

**Purpose**: Connect to an external MCP server (as a client).

**Parameters**:
- `name` (string): Friendly name for connection
- `url` (string): MCP server URL
- `transport` (enum): "sse", "streamable-http", or "auto"

**Example**:
```
Connect to MCP server at https://other-server.workers.dev/sse with name "external-api"
```

#### 13. `list_connected_mcp_servers`

**Purpose**: List all connected external servers.

**Parameters**: None

**Output**: Connection name, URL, status, last sync time.

**Example**:
```
Show all my connected MCP servers
```

#### 14. `call_mcp_tool`

**Purpose**: Call a tool on a connected external server.

**Parameters**:
- `serverName` (string): Connection name
- `toolName` (string): Tool to call
- `arguments` (object): Tool arguments

**Example**:
```
Call "get_data" tool on external-api with argument id="123"
```

### Deployment Tools (Tool 15-16)

#### 15. `wrangler_deploy`

**Purpose**: Build and deploy your server to Cloudflare Workers.

**Parameters**:
- `serverId` (string): Server ID to deploy

**Process**:
1. Updates status to "building"
2. Compiles code in container
3. Updates status to "deploying"
4. Deploys to Cloudflare Workers
5. Updates status to "active"

**Output**: Deployment URL, worker name, and SSE connection endpoint.

**Example**:
```
Deploy weather-api to production
```

#### 16. `connect_external_mcp`

**Purpose**: Connect to external MCP server via RPC interface.

**Parameters**:
- `serverId` (string): Unique connection ID
- `serverUrl` (string): MCP server URL
- `serverName` (string): Friendly name

**Example**:
```
Connect to external MCP at https://api.example.com/sse with ID "example-1"
```

### Container Management (Tools 17-22)

#### 17. `container_initialize`

**Purpose**: Initialize a container with specific image and environment.

**Parameters**:
- `containerId` (string): Container ID
- `image` (enum, optional): Container image
  - `"python:3.12-slim"`
  - `"python:3.11-slim"`
  - `"node:20-alpine"`
  - `"node:18-alpine"`
  - `"ubuntu:24.04"`
- `env` (object, optional): Environment variables
- `workdir` (string, optional): Working directory (default: /workspace)

**Example**:
```
Initialize container "cnt-123" with Node.js 20 and working directory /workspace
```

#### 18. `container_exec`

**Purpose**: Execute commands in a container.

**Parameters**:
- `containerId` (string): Container ID
- `args` (string): Command to execute
- `timeout` (number, optional): Timeout in ms (default: 30000)
- `streamStderr` (boolean, optional): Include stderr (default: true)

**Security**: Automatically blocks dangerous commands (rm -rf /, fork bombs, etc.)

**Example**:
```
Run "npm install" in container "cnt-123"
```

#### 19. `container_file_write`

**Purpose**: Write a file to container filesystem.

**Parameters**:
- `containerId` (string): Container ID
- `path` (string): File path (must be in /workspace)
- `text` (string): File content
- `encoding` (enum, optional): "utf-8" or "base64"
- `createDirs` (boolean, optional): Create parent dirs (default: true)

**Security**: Only allows writing to /workspace directory.

**Example**:
```
Write package.json to /workspace/package.json in container "cnt-123"
```

#### 20. `container_file_read`

**Purpose**: Read a file from container.

**Parameters**:
- `containerId` (string): Container ID
- `path` (string): File path to read
- `encoding` (enum, optional): "utf-8" or "base64"

**Auto-detection**: Automatically uses base64 for images.

**Example**:
```
Read /workspace/output.txt from container "cnt-123"
```

#### 21. `container_files_list`

**Purpose**: List files in container directory.

**Parameters**:
- `containerId` (string): Container ID
- `path` (string, optional): Directory path (default: /workspace)
- `recursive` (boolean, optional): List subdirectories (default: false)
- `maxDepth` (number, optional): Max recursion depth (default: 2)
- `filter` (string, optional): Filter pattern (supports * and ?)

**Example**:
```
List all .ts files recursively in /workspace of container "cnt-123"
```

#### 22. `container_file_delete`

**Purpose**: Delete files/directories in container.

**Parameters**:
- `containerId` (string): Container ID
- `path` (string): Path to delete (must be in /workspace)
- `recursive` (boolean, optional): Delete directories recursively
- `force` (boolean, optional): Continue on errors

**Security**: Cannot delete system directories or paths outside /workspace.

**Example**:
```
Delete /workspace/temp directory recursively in container "cnt-123"
```

## Common Workflows

### Workflow 1: Create a Simple API Server

**Goal**: Create an MCP server that provides stock price information.

**Steps**:

1. **Initialize the server**:
   ```
   Create a new MCP server named "stock-prices" that provides real-time stock price information
   ```

2. **Add a tool to fetch prices**:
   ```
   Add a tool to stock-prices called "get_stock_price" that takes a stock symbol (string) and returns the current price. Implementation should fetch from https://api.example.com/stock/{symbol}
   ```

3. **Add a resource for supported symbols**:
   ```
   Add a resource to stock-prices at "stocks://symbols" that lists all supported stock symbols in JSON format
   ```

4. **Deploy to production**:
   ```
   Deploy stock-prices to Cloudflare Workers
   ```

5. **Get connection instructions**:
   ```
   How do I connect to stock-prices?
   ```

### Workflow 2: Create a Data Processing Server

**Goal**: Build an MCP server that processes CSV data.

**Steps**:

1. **Initialize**:
   ```
   Create an MCP server named "csv-processor" version "1.0.0" that processes and analyzes CSV data
   ```

2. **Add parsing tool**:
   ```
   Add a tool "parse_csv" to csv-processor that takes csv_data (string) and returns parsed JSON array
   ```

3. **Add analysis tool**:
   ```
   Add a tool "analyze_csv" to csv-processor that takes csv_data (string) and returns statistics including row count, column names, and data types
   ```

4. **Add transformation tool**:
   ```
   Add a tool "transform_csv" that takes csv_data (string) and operations (array) and returns transformed CSV
   ```

5. **Add example prompt**:
   ```
   Add a prompt "analyze_sales_data" that takes csv_data and generates a comprehensive sales analysis report
   ```

6. **Deploy and connect**:
   ```
   Deploy csv-processor and show me how to connect to it
   ```

### Workflow 3: Create a Database Query Server

**Goal**: Build an MCP server that queries a database.

**Steps**:

1. **Initialize with configuration**:
   ```
   Create an MCP server named "db-query" that provides SQL query interface to a PostgreSQL database
   ```

2. **Configure environment variables**:
   ```
   Configure db-query with environment variables: DB_HOST="postgres.example.com", DB_NAME="mydb", DB_USER="user"
   ```

3. **Add query tool**:
   ```
   Add a tool "execute_query" that takes sql (string) and parameters (array) and returns query results
   ```

4. **Add schema tool**:
   ```
   Add a tool "get_schema" that returns the database schema for all tables
   ```

5. **Add safety checks**:
   ```
   Update execute_query to validate SQL and prevent destructive operations (DROP, TRUNCATE, DELETE without WHERE)
   ```

6. **Deploy with monitoring**:
   ```
   Deploy db-query and enable observability
   ```

### Workflow 4: Integrate External APIs

**Goal**: Create server that aggregates multiple APIs.

**Steps**:

1. **Initialize**:
   ```
   Create MCP server "api-aggregator" that combines data from multiple weather, news, and finance APIs
   ```

2. **Add multiple tools**:
   ```
   Add three tools to api-aggregator:
   1. "get_weather" - fetches from OpenWeather API
   2. "get_news" - fetches from NewsAPI
   3. "get_stocks" - fetches from Alpha Vantage
   ```

3. **Add aggregation tool**:
   ```
   Add tool "get_dashboard_data" that calls all three APIs and combines results into a single dashboard object
   ```

4. **Add caching resource**:
   ```
   Add resource "api://cache-status" that shows API call counts and cache hit rates
   ```

5. **Deploy and test**:
   ```
   Deploy api-aggregator and call get_dashboard_data tool to verify it works
   ```

### Workflow 5: Development and Testing

**Goal**: Develop and test before deploying.

**Steps**:

1. **Create server in draft mode**:
   ```
   Create MCP server "test-server" for testing new features
   ```

2. **Add experimental tool**:
   ```
   Add tool "experimental_feature" to test-server with basic implementation
   ```

3. **View generated code**:
   ```
   Show me the generated code for test-server (all files)
   ```

4. **Test in container**:
   ```
   Initialize container for test-server and run npm test
   ```

5. **Update implementation**:
   ```
   Update experimental_feature tool with improved implementation: [new code]
   ```

6. **Deploy when ready**:
   ```
   Deploy test-server to production
   ```

7. **Connect and verify**:
   ```
   Connect to deployed test-server and verify all tools work correctly
   ```

### Workflow 6: Maintenance and Cleanup

**Goal**: Keep your servers organized.

**Steps**:

1. **List all servers**:
   ```
   Show me all my MCP servers
   ```

2. **Check old servers**:
   ```
   Find servers I haven't updated in 30 days (dry run)
   ```

3. **Get details**:
   ```
   Show detailed information about servers marked for cleanup
   ```

4. **Cleanup with confirmation**:
   ```
   Delete servers older than 60 days
   ```
   (You'll be asked to confirm)

5. **Verify cleanup**:
   ```
   List all my MCP servers again
   ```

## Best Practices

### Naming Conventions

**Server Names**:
- Use lowercase letters, numbers, and hyphens only
- Be descriptive: `weather-api` not `wa`
- Include purpose: `customer-data-processor`
- Avoid version numbers in name (use version field)

**Tool Names**:
- Use verb_noun format: `get_weather`, `create_user`, `delete_record`
- Be specific: `calculate_shipping_cost` not `calculate`
- Use snake_case consistently

**Resource URIs**:
- Use consistent scheme: `weather://config`, `api://status`
- Include resource type: `data://users`, `docs://readme`
- Be hierarchical: `api://v1/users`, `api://v2/users`

### Security Best Practices

1. **Never hardcode secrets**: Use environment variables
   ```
   Configure my-server with vars: API_KEY="${API_KEY}", DB_PASSWORD="${DB_PASSWORD}"
   ```

2. **Validate inputs**: Always validate parameters in tool implementations
   ```javascript
   if (!params.email || !params.email.includes('@')) {
     return { content: [{ type: "text", text: "Invalid email" }] };
   }
   ```

3. **Rate limiting**: Implement rate limiting in tools that make external API calls

4. **Error handling**: Always wrap implementations in try-catch
   ```javascript
   try {
     // your code
   } catch (error) {
     return {
       content: [{
         type: "text",
         text: `Error: ${error.message}`
       }]
     };
   }
   ```

5. **Least privilege**: Only request permissions your server actually needs

### Performance Optimization

1. **Caching**: Cache frequently accessed data
   ```javascript
   const cached = await env.KV.get(`cache:${key}`);
   if (cached) return JSON.parse(cached);
   ```

2. **Async operations**: Use Promise.all for parallel API calls
   ```javascript
   const [weather, news] = await Promise.all([
     fetch(weatherAPI),
     fetch(newsAPI)
   ]);
   ```

3. **Timeouts**: Set appropriate timeouts for external calls
   ```javascript
   const response = await fetch(url, {
     signal: AbortSignal.timeout(5000) // 5 second timeout
   });
   ```

4. **Batch operations**: Process multiple items in single tool call when possible

### Error Recovery

1. **Check server status** before operations:
   ```
   Show me details of my-server
   ```

2. **If build fails**, check generated code:
   ```
   Show me the generated code for my-server (index file)
   ```

3. **If deployment fails**, verify Wrangler config:
   ```
   Show me the wrangler configuration for my-server
   ```

4. **Retry with updated implementation**: Simply add the tool again with fixes

### Version Management

1. **Start with 1.0.0** for production-ready servers
2. **Use semantic versioning**: 
   - Major: Breaking changes
   - Minor: New features
   - Patch: Bug fixes
3. **Keep changelog** in server description or resource

### Testing Strategy

1. **Test locally first**: Use container tools to test before deployment
2. **Incremental development**: Add one tool at a time and test
3. **Use dry runs**: Test cleanup and destructive operations with dryRun=true
4. **External testing**: Connect to deployed server and verify all tools

## Troubleshooting

### Server Creation Issues

**Problem**: "Server name already exists"
- **Solution**: Choose a different name or delete the existing server
- **Check**: `List all my MCP servers` to see existing names

**Problem**: "Invalid server name format"
- **Solution**: Use only lowercase letters, numbers, and hyphens
- **Valid**: `my-api-server`, `data-processor-v2`
- **Invalid**: `My_API_Server`, `api.server`, `server@test`

### Tool Addition Issues

**Problem**: "Server not found when adding tool"
- **Solution**: Verify server exists: `Show details of [server-name]`
- **Solution**: Check you're using the correct server ID (name)

**Problem**: "Container has no space"
- **Solution**: Clean up container files: `Delete old files in container [id]`
- **Solution**: Create a new container for the server

**Problem**: "Implementation code error"
- **Solution**: Verify JavaScript syntax is correct
- **Solution**: Check that all variables are defined
- **Solution**: Make sure async/await is used correctly

### Deployment Issues

**Problem**: "Build failed"
- **Possible causes**:
  - Syntax error in tool implementation
  - Missing dependencies
  - Container resource limits exceeded
- **Debug**: View generated code and check for errors
- **Solution**: Fix implementation and redeploy

**Problem**: "Deployment failed"
- **Possible causes**:
  - Wrangler configuration issues
  - Cloudflare API limits
  - Network connectivity
- **Solution**: Wait a few minutes and try again
- **Solution**: Check Cloudflare dashboard for account issues

**Problem**: "Server status stuck in 'building'"
- **Solution**: Wait up to 5 minutes for build to complete
- **Solution**: If still stuck, delete and recreate server

### Connection Issues

**Problem**: "Cannot connect to deployed server"
- **Check deployment status**: `Show details of [server-name]`
- **Verify URL**: Should be `https://[worker-name].[account].workers.dev/sse`
- **Test health**: `curl https://[worker-url]/health`
- **Check Claude Desktop config**: Restart after configuration changes

**Problem**: "Tools not showing in Claude"
- **Solution**: Restart Claude Desktop completely
- **Solution**: Verify MCP server URL is correct
- **Solution**: Check that server status is "active"

### Performance Issues

**Problem**: "Server response is slow"
- **Check**: Are you making multiple external API calls? Use Promise.all
- **Check**: Are you processing large amounts of data? Implement pagination
- **Check**: Are you using caching? Add KV caching for frequently accessed data

**Problem**: "Container operations timeout"
- **Solution**: Increase timeout parameter: `timeout: 60000` (60 seconds)
- **Solution**: Break large operations into smaller chunks
- **Solution**: Use async execution for long-running tasks

### Data Issues

**Problem**: "Cannot read/write files in container"
- **Check**: Path must be in /workspace
- **Check**: Parent directories exist (use createDirs: true)
- **Check**: File encoding is correct (utf-8 for text, base64 for binary)

**Problem**: "Lost server configuration after restart"
- **Issue**: Data is persisted in D1 database, should not be lost
- **Solution**: Check database connection
- **Solution**: Verify server wasn't deleted

### Common Error Messages

**"Server not found"**
- Verify server ID is correct
- Check server wasn't deleted
- Use `list_mcp_servers` to see all servers

**"Unauthorized" or "Access denied"**
- Verify API credentials if accessing external services
- Check service bindings are properly configured

**"Rate limit exceeded"**
- Wait before making more requests
- Implement exponential backoff in tool implementations
- Consider caching responses

**"Invalid parameter type"**
- Check parameter matches expected type (string, number, boolean, etc.)
- Verify required parameters are provided
- Check for typos in parameter names

## Getting Help

### Documentation Resources

- **README.md**: Quick start and overview
- **ARCHITECTURE.md**: Technical architecture details
- **PRODUCTIVITY_GUIDE.md**: Use cases and productivity tips
- **TOOL_SUGGESTIONS.md**: Integration ideas and possibilities

### Self-Help

1. **Check server status**: Always start with `get_mcp_server_details`
2. **View logs**: Check container execution output
3. **Test incrementally**: Add one feature at a time
4. **Use dry runs**: Test destructive operations safely

### Community Support

- GitHub Issues: Report bugs or request features
- Discussions: Ask questions and share use cases
- Pull Requests: Contribute improvements

### Professional Support

For production deployments or custom implementations, consider:
- Cloudflare Enterprise support
- Professional services for custom MCP servers
- Training sessions for teams

---

**Next Steps**: 
- Read [PRODUCTIVITY_GUIDE.md](PRODUCTIVITY_GUIDE.md) for use case ideas
- Review [ARCHITECTURE.md](ARCHITECTURE.md) for technical details
- Explore [TOOL_SUGGESTIONS.md](TOOL_SUGGESTIONS.md) for integration possibilities
