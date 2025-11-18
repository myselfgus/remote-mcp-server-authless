# Meta-MCP Server - Troubleshooting Guide

## Table of Contents

1. [Quick Diagnostics](#quick-diagnostics)
2. [Connection Issues](#connection-issues)
3. [Deployment Problems](#deployment-problems)
4. [Server Creation Errors](#server-creation-errors)
5. [Tool Execution Failures](#tool-execution-failures)
6. [Performance Issues](#performance-issues)
7. [Database Problems](#database-problems)
8. [Container Issues](#container-issues)
9. [Service Binding Errors](#service-binding-errors)
10. [Common Error Messages](#common-error-messages)
11. [Getting Help](#getting-help)

## Quick Diagnostics

### Health Check Script

Run this script for quick diagnostics:

```bash
#!/bin/bash

echo "🔍 Meta-MCP Server Diagnostics"
echo "================================"

# 1. Check if server is reachable
echo -n "Server reachable: "
if curl -s --max-time 5 https://meta-mcp.your-account.workers.dev/health > /dev/null; then
    echo "✅ Yes"
else
    echo "❌ No"
fi

# 2. Check health endpoint
echo -n "Health check: "
HEALTH=$(curl -s https://meta-mcp.your-account.workers.dev/health)
if echo $HEALTH | grep -q "ok"; then
    echo "✅ Healthy"
else
    echo "❌ Unhealthy"
fi

# 3. Check SSE endpoint
echo -n "SSE endpoint: "
if curl -s --max-time 5 https://meta-mcp.your-account.workers.dev/sse > /dev/null; then
    echo "✅ Accessible"
else
    echo "❌ Not accessible"
fi

# 4. Check local environment
echo -n "Node.js installed: "
if command -v node &> /dev/null; then
    echo "✅ $(node --version)"
else
    echo "❌ Not found"
fi

echo -n "Wrangler installed: "
if command -v wrangler &> /dev/null; then
    echo "✅ $(wrangler --version)"
else
    echo "❌ Not found"
fi

echo "================================"
echo "Diagnostics complete"
```

Save as `diagnostics.sh`, make executable (`chmod +x diagnostics.sh`), and run (`./diagnostics.sh`).

### Manual Checks

```bash
# 1. Health endpoint
curl https://meta-mcp.your-account.workers.dev/health

# 2. Server info
curl https://meta-mcp.your-account.workers.dev/

# 3. SSE endpoint test
curl -N https://meta-mcp.your-account.workers.dev/sse

# 4. Check Wrangler auth
wrangler whoami

# 5. List deployments
wrangler deployments list
```

## Connection Issues

### Problem: Cannot Connect from Claude Desktop

**Symptoms**:
- Tools don't appear in Claude
- "Connection failed" error
- Claude hangs when trying to connect

**Diagnostic Steps**:

1. **Verify server is running**:
```bash
curl https://meta-mcp.your-account.workers.dev/health
```

Expected: `{"status":"ok",...}`

2. **Check Claude Desktop config**:

macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
Windows: `%APPDATA%\Claude\claude_desktop_config.json`
Linux: `~/.config/claude/claude_desktop_config.json`

3. **Verify config syntax**:
```json
{
  "mcpServers": {
    "meta-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://meta-mcp.your-account.workers.dev/sse"]
    }
  }
}
```

**Solutions**:

**Solution 1**: Restart Claude Desktop completely
```bash
# macOS
killall Claude
# Then reopen Claude

# Windows
# Task Manager → End Task on Claude
# Then reopen
```

**Solution 2**: Check URL formatting
- Ensure URL ends with `/sse`
- No trailing spaces
- HTTPS (not HTTP)
- Correct domain

**Solution 3**: Test with curl
```bash
# Should return SSE connection
curl -N https://meta-mcp.your-account.workers.dev/sse
```

**Solution 4**: Check firewall/proxy
- Disable VPN temporarily
- Check corporate firewall settings
- Try different network

**Solution 5**: Use local development
```bash
# Start local server
npm run dev

# Update config to use localhost
"args": ["-y", "mcp-remote", "http://localhost:8787/sse"]
```

### Problem: Tools Appear but Don't Work

**Symptoms**:
- Tools listed in Claude
- Clicking tool shows error
- "Tool execution failed"

**Diagnostic Steps**:

1. **Check tool availability**:
```bash
# List all MCP servers
# In Claude: "List all my MCP servers"
```

2. **Test tool directly via API**:
```bash
curl -X POST https://meta-mcp.your-account.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{"method":"tools/list","params":{}}'
```

**Solutions**:

**Solution 1**: Server initialization issue
```bash
# Redeploy the server
wrangler deploy
```

**Solution 2**: Database not initialized
```bash
# Run migrations
wrangler d1 migrations apply meta-mcp-db
```

**Solution 3**: Check logs
```bash
# Tail logs in real-time
wrangler tail meta-mcp

# Look for errors during tool execution
```

### Problem: Intermittent Connection Drops

**Symptoms**:
- Works sometimes, fails others
- Connection timeout errors
- Random disconnections

**Solutions**:

**Solution 1**: Increase timeout
```json
{
  "mcpServers": {
    "meta-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://meta-mcp.your-account.workers.dev/sse"],
      "env": {
        "MCP_TIMEOUT": "60000"
      }
    }
  }
}
```

**Solution 2**: Check Cloudflare status
- Visit [www.cloudflarestatus.com](https://www.cloudflarestatus.com)
- Check for ongoing incidents

**Solution 3**: Implement retry logic
```javascript
// In tool implementation
const MAX_RETRIES = 3;
for (let i = 0; i < MAX_RETRIES; i++) {
  try {
    const result = await fetch(...);
    return result;
  } catch (error) {
    if (i === MAX_RETRIES - 1) throw error;
    await new Promise(r => setTimeout(r, 1000 * (i + 1)));
  }
}
```

## Deployment Problems

### Problem: "wrangler: command not found"

**Solution 1**: Install Wrangler globally
```bash
npm install -g wrangler

# Verify installation
wrangler --version
```

**Solution 2**: Use npx
```bash
npx wrangler deploy
```

**Solution 3**: Install locally
```bash
npm install wrangler --save-dev
npx wrangler deploy
```

### Problem: "Authentication Error"

**Symptoms**:
- Cannot deploy
- "Not authenticated" message
- 401 errors

**Solutions**:

**Solution 1**: Login again
```bash
wrangler logout
wrangler login
```

**Solution 2**: Use API token
```bash
# Create token at dash.cloudflare.com/profile/api-tokens
export CLOUDFLARE_API_TOKEN="your-token"
wrangler deploy
```

**Solution 3**: Check account ID
```bash
wrangler whoami
# Verify account ID matches wrangler.jsonc
```

### Problem: "Namespace Already Exists"

**Solution**: Update name in wrangler.jsonc
```jsonc
{
  "name": "meta-mcp-v2"  // Changed from meta-mcp
}
```

Or delete existing deployment:
```bash
wrangler delete meta-mcp
```

### Problem: "Build Failed"

**Diagnostic**:
```bash
# Check TypeScript errors
npm run type-check

# Check for syntax errors
npm run lint:fix
```

**Solutions**:

**Solution 1**: Fix TypeScript errors
```bash
# See errors
npm run type-check

# Common fixes:
# - Add missing types
# - Fix import paths
# - Update dependencies
```

**Solution 2**: Clean install
```bash
rm -rf node_modules package-lock.json
npm install
```

**Solution 3**: Check Node version
```bash
node --version  # Should be 18+

# Update if needed
nvm install 18
nvm use 18
```

### Problem: "Deployment Timeout"

**Solutions**:

**Solution 1**: Wait and retry
```bash
# Try again after 2-3 minutes
wrangler deploy
```

**Solution 2**: Deploy to different region
```bash
# Add to wrangler.jsonc
{
  "routes": [
    {
      "pattern": "meta-mcp.your-account.workers.dev",
      "zone_name": "workers.dev"
    }
  ]
}
```

**Solution 3**: Check bundle size
```bash
# If bundle is too large, optimize:
# - Remove unused dependencies
# - Enable code splitting
# - Minimize external dependencies
```

## Server Creation Errors

### Problem: "Server name already exists"

**Solution 1**: Use different name
```
Create a new MCP server named "my-api-v2" instead
```

**Solution 2**: Delete existing server
```
Delete the server "my-api"
```

Then recreate.

### Problem: "Container creation failed"

**Symptoms**:
- Server stuck in "creating" status
- Error mentioning container

**Solutions**:

**Solution 1**: Check service binding
```bash
# Verify CONTAINER_MANAGER is configured
# In wrangler.jsonc:
"services": [
  {
    "binding": "CONTAINER_MANAGER",
    "service": "containers-manager"
  }
]
```

**Solution 2**: Deploy container manager service
```bash
# If not using service binding, remove from wrangler.jsonc
# Server will use alternative build method
```

**Solution 3**: Retry creation
```bash
# Delete failed server
# In Claude: "Delete server 'my-server'"

# Create again
# In Claude: "Create server 'my-server' again"
```

### Problem: "Invalid server name format"

**Symptoms**:
- Error about name format
- Server not created

**Solution**: Follow naming rules
- **Valid**: `my-api`, `data-processor`, `api-v2`
- **Invalid**: `My_API`, `api.server`, `SERVER!`

Rules:
- Lowercase letters only
- Numbers allowed
- Hyphens allowed
- No spaces, underscores, or special characters

## Tool Execution Failures

### Problem: "Tool not found"

**Diagnostic**:
```
In Claude: "Show details of server 'my-server'"
# Check if tool is listed
```

**Solutions**:

**Solution 1**: Add the tool
```
In Claude: "Add tool 'my_tool' to server 'my-server'"
```

**Solution 2**: Check tool name spelling
- Tool names are case-sensitive
- Use exact name from server details

### Problem: "Parameter validation failed"

**Symptoms**:
- "Invalid parameters" error
- Type mismatch errors

**Solutions**:

**Solution 1**: Check parameter types
```javascript
// Tool expects:
{
  city: "string",  // Not a number
  count: 5         // Not a string
}
```

**Solution 2**: Provide required parameters
```javascript
// If parameter is required:
{
  city: "London",  // ✅ Provided
  // country is optional, can be omitted
}
```

**Solution 3**: Fix parameter schema
```
In Claude: "Update tool 'get_weather' to make 'units' parameter optional"
```

### Problem: "Implementation error"

**Symptoms**:
- Tool executes but returns error
- JavaScript errors in logs

**Diagnostic**:
```bash
# Check logs
wrangler tail meta-mcp --status error
```

**Solutions**:

**Solution 1**: Fix JavaScript syntax
```javascript
// ❌ Bad
const data = await fetch(url)
const json = await data.json()  // Missing semicolon/async

// ✅ Good
const data = await fetch(url);
const json = await data.json();
```

**Solution 2**: Add error handling
```javascript
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return await response.json();
} catch (error) {
  return {
    content: [{
      type: "text",
      text: `Error: ${error.message}`
    }]
  };
}
```

**Solution 3**: Update tool implementation
```
In Claude: "Update tool 'my_tool' with fixed implementation: [corrected code]"
```

### Problem: "Timeout exceeded"

**Symptoms**:
- Tool takes too long
- Timeout error

**Solutions**:

**Solution 1**: Optimize implementation
```javascript
// Use Promise.all for parallel requests
const [data1, data2] = await Promise.all([
  fetch(url1),
  fetch(url2)
]);
```

**Solution 2**: Add timeout to fetch
```javascript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 5000);

try {
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeout);
  return response;
} catch (error) {
  if (error.name === 'AbortError') {
    throw new Error('Request timeout');
  }
  throw error;
}
```

**Solution 3**: Break into smaller operations
- Don't process large datasets in one tool call
- Use pagination
- Implement streaming for large responses

## Performance Issues

### Problem: Slow Response Times

**Diagnostic**:
```bash
# Test response time
time curl https://meta-mcp.your-account.workers.dev/health

# Should be < 100ms for health check
```

**Solutions**:

**Solution 1**: Enable caching
```javascript
// Cache in KV
const cached = await env.KV.get(`cache:${key}`, "json");
if (cached) return cached;

const data = await expensiveOperation();
await env.KV.put(`cache:${key}`, JSON.stringify(data), {
  expirationTtl: 3600  // 1 hour
});
return data;
```

**Solution 2**: Optimize database queries
```sql
-- Add indexes
CREATE INDEX idx_servers_name ON mcp_servers(name);

-- Use prepared statements
SELECT * FROM servers WHERE id = ?
```

**Solution 3**: Reduce external API calls
- Batch requests where possible
- Cache responses
- Use CDN for static content

### Problem: High Error Rate

**Diagnostic**:
```bash
# Check error logs
wrangler tail meta-mcp --status error

# Check Cloudflare dashboard
# Workers → Your Worker → Metrics
```

**Solutions**:

**Solution 1**: Add retry logic
```javascript
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fetch(url);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000));
    }
  }
}
```

**Solution 2**: Improve error handling
```javascript
// Catch all errors
try {
  // Your code
} catch (error) {
  console.error('Error:', error);
  // Log to external service
  await logError(error);
  // Return user-friendly message
  return formatError(error);
}
```

**Solution 3**: Rate limit external APIs
```javascript
const rateLimiter = new RateLimiter(10, 1000); // 10 requests per second
await rateLimiter.wait();
await fetch(url);
```

### Problem: Memory Issues

**Symptoms**:
- "Memory limit exceeded"
- Worker terminates unexpectedly

**Solutions**:

**Solution 1**: Process in chunks
```javascript
// ❌ Bad: Load everything at once
const allData = await fetch(largeDataUrl).then(r => r.json());

// ✅ Good: Stream and process chunks
const response = await fetch(largeDataUrl);
const reader = response.body.getReader();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  processChunk(value);
}
```

**Solution 2**: Limit data size
```javascript
// Limit response size
const data = await fetch(url).then(r => r.json());
if (data.length > 10000) {
  return data.slice(0, 10000);  // Truncate
}
```

**Solution 3**: Use streaming responses
```typescript
// Return streaming response
return new Response(
  stream,
  {
    headers: {
      'Content-Type': 'application/json',
      'Transfer-Encoding': 'chunked'
    }
  }
);
```

## Database Problems

### Problem: "Database not found"

**Solutions**:

**Solution 1**: Create database
```bash
wrangler d1 create meta-mcp-db
```

**Solution 2**: Update database ID in wrangler.jsonc
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "meta-mcp-db",
      "database_id": "YOUR_ACTUAL_DATABASE_ID"
    }
  ]
}
```

**Solution 3**: Run migrations
```bash
wrangler d1 migrations apply meta-mcp-db
```

### Problem: "Table does not exist"

**Solution**: Run migrations
```bash
# Check migration status
wrangler d1 migrations list meta-mcp-db

# Apply migrations
wrangler d1 migrations apply meta-mcp-db
```

### Problem: "Database query timeout"

**Solutions**:

**Solution 1**: Optimize query
```sql
-- Add indexes
CREATE INDEX IF NOT EXISTS idx_servers_updated 
ON mcp_servers(updated_at);

-- Use LIMIT
SELECT * FROM servers 
WHERE updated_at > ? 
LIMIT 100;
```

**Solution 2**: Use batch operations
```typescript
// Instead of multiple queries:
for (const item of items) {
  await db.execute(`INSERT INTO...`, item);
}

// Use batch:
await db.batch(
  items.map(item => db.prepare(`INSERT INTO...`).bind(item))
);
```

**Solution 3**: Cache query results
```typescript
const cacheKey = `query:${queryHash}`;
const cached = await env.KV.get(cacheKey);
if (cached) return JSON.parse(cached);

const result = await db.execute(query);
await env.KV.put(cacheKey, JSON.stringify(result), {
  expirationTtl: 300  // 5 minutes
});
```

## Container Issues

### Problem: "Container not found"

**Solutions**:

**Solution 1**: Check container ID
```
In Claude: "Show details of server 'my-server'"
# Look for container_id in output
```

**Solution 2**: Recreate container
```
In Claude: "Delete server 'my-server' and create a new one"
```

### Problem: "Container command failed"

**Diagnostic**:
```bash
# Check container logs
wrangler tail meta-mcp | grep container
```

**Solutions**:

**Solution 1**: Check command syntax
```javascript
// ❌ Bad command
"rm -rf /"  // Blocked by security

// ✅ Good command
"npm install"
```

**Solution 2**: Increase timeout
```
In Claude: "Run 'npm install' in container with timeout 60000"
```

**Solution 3**: Check file paths
```javascript
// Must be in /workspace
"/workspace/package.json"  // ✅
"/etc/passwd"              // ❌ Blocked
```

## Service Binding Errors

### Problem: "Service binding not found"

**Solutions**:

**Solution 1**: Deploy required service
```bash
# Deploy the service first
cd ../worker-publisher
wrangler deploy
```

**Solution 2**: Remove binding if not needed
```jsonc
// Comment out or remove from wrangler.jsonc
// "services": [...]
```

**Solution 3**: Check service name
```jsonc
{
  "services": [
    {
      "binding": "WORKER_PUBLISHER",
      "service": "worker-publisher",  // Must match deployed service name
      "environment": "production"
    }
  ]
}
```

### Problem: "RPC call failed"

**Diagnostic**:
```bash
# Check if service is deployed
wrangler deployments list worker-publisher
```

**Solutions**:

**Solution 1**: Verify service is running
```bash
curl https://worker-publisher.your-account.workers.dev/health
```

**Solution 2**: Check RPC method exists
```typescript
// Verify method is exported in service
export class WorkerPublisherRPC {
  async deployFromMetaMCP(...) { ... }  // Must exist
}
```

**Solution 3**: Update service
```bash
cd ../worker-publisher
git pull
wrangler deploy
```

## Common Error Messages

### "Error: Server creation failed"

**Causes**:
- Database not initialized
- Container manager unavailable
- Invalid configuration

**Fix**:
1. Run migrations: `wrangler d1 migrations apply meta-mcp-db`
2. Check service bindings
3. Verify wrangler.jsonc is valid

### "Error: Tool execution failed"

**Causes**:
- JavaScript syntax error
- Missing dependencies
- Network timeout
- External API failure

**Fix**:
1. Check tool implementation syntax
2. Add error handling
3. Test external APIs separately
4. Add timeouts to fetch calls

### "Error: Database locked"

**Causes**:
- Concurrent writes to D1
- Long-running transaction

**Fix**:
```typescript
// Use batch operations
await db.batch([...]);

// Add retry logic
async function withRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('locked') && i < retries - 1) {
        await new Promise(r => setTimeout(r, 100 * (i + 1)));
        continue;
      }
      throw error;
    }
  }
}
```

### "Error: Rate limit exceeded"

**Causes**:
- Too many requests
- Cloudflare limits hit
- External API limits

**Fix**:
1. Implement rate limiting
2. Add delays between requests
3. Cache responses
4. Upgrade Cloudflare plan if needed

### "Error: Worker exceeded CPU time"

**Causes**:
- Long-running computation
- Infinite loop
- Inefficient code

**Fix**:
1. Optimize algorithms
2. Move heavy processing to external service
3. Break into smaller operations
4. Upgrade to Workers Paid plan

## Getting Help

### Self-Help Resources

1. **Check Documentation**:
   - [USER_MANUAL.md](USER_MANUAL.md)
   - [ARCHITECTURE.md](ARCHITECTURE.md)
   - [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

2. **Review Logs**:
```bash
wrangler tail meta-mcp
wrangler tail meta-mcp --status error
```

3. **Test Components**:
```bash
# Test health
curl https://meta-mcp.your-account.workers.dev/health

# Test SSE
curl -N https://meta-mcp.your-account.workers.dev/sse

# Test database
wrangler d1 execute meta-mcp-db --command "SELECT * FROM mcp_servers LIMIT 1"
```

### Community Support

1. **GitHub Issues**: [github.com/myselfgus/remote-mcp-server-authless/issues](https://github.com/myselfgus/remote-mcp-server-authless/issues)
   - Search existing issues
   - Create new issue with:
     - Clear description
     - Steps to reproduce
     - Error messages
     - Environment details

2. **Discussions**: [GitHub Discussions](https://github.com/myselfgus/remote-mcp-server-authless/discussions)
   - Ask questions
   - Share solutions
   - Request features

3. **Discord/Community Chat**:
   - Real-time help
   - Share experiences
   - Learn from others

### Professional Support

1. **Cloudflare Support**:
   - Dashboard: Support → Contact Support
   - Community: [community.cloudflare.com](https://community.cloudflare.com)
   - Docs: [developers.cloudflare.com](https://developers.cloudflare.com)

2. **Paid Consulting**:
   - For complex deployments
   - Custom implementations
   - Training and workshops

### Creating Good Bug Reports

Include:

1. **Environment**:
```
- OS: macOS 13.5
- Node: v18.17.0
- Wrangler: 3.15.0
- Claude Desktop: 0.5.2
```

2. **Steps to Reproduce**:
```
1. Open Claude Desktop
2. Add Meta-MCP server
3. Try to create server named "test-api"
4. Error appears
```

3. **Expected vs Actual**:
```
Expected: Server created successfully
Actual: Error: "Server creation failed"
```

4. **Logs/Errors**:
```
[ERROR] Failed to create container
ContainerError: Timeout after 30s
```

5. **Screenshots**: If applicable

---

## Quick Reference

### Must-Know Commands

```bash
# Health check
curl https://meta-mcp.your-account.workers.dev/health

# View logs
wrangler tail meta-mcp

# Redeploy
wrangler deploy

# Run migrations
wrangler d1 migrations apply meta-mcp-db

# List servers (in Claude)
"List all my MCP servers"

# Check server details (in Claude)
"Show details of server 'my-server'"
```

### Emergency Contacts

- **Cloudflare Status**: [www.cloudflarestatus.com](https://www.cloudflarestatus.com)
- **GitHub Issues**: [github.com/myselfgus/remote-mcp-server-authless/issues](https://github.com/myselfgus/remote-mcp-server-authless/issues)
- **Community**: [Discussions](https://github.com/myselfgus/remote-mcp-server-authless/discussions)

---

**Remember**: Most issues can be resolved by:
1. Checking logs
2. Redeploying
3. Restarting Claude Desktop
4. Running migrations

**Still stuck?** Create an issue on GitHub with details! 🚀
