# Meta-MCP Server - Deployment Guide

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Local Development Setup](#local-development-setup)
3. [Production Deployment](#production-deployment)
4. [Configuration](#configuration)
5. [Database Setup](#database-setup)
6. [Service Bindings](#service-bindings)
7. [Environment Variables](#environment-variables)
8. [Post-Deployment](#post-deployment)
9. [Continuous Deployment](#continuous-deployment)
10. [Rollback Procedures](#rollback-procedures)

## Prerequisites

### Required Accounts

1. **Cloudflare Account**
   - Sign up at [cloudflare.com](https://cloudflare.com)
   - Free tier available (suitable for development and small production)
   - Workers Paid plan recommended for production ($5/month)

2. **GitHub Account** (optional, for CI/CD)
   - For repository hosting
   - For GitHub Actions

### Required Software

```bash
# Node.js 18 or later
node --version  # Should be v18.0.0+

# npm (comes with Node.js)
npm --version   # Should be 9.0.0+

# Wrangler CLI
npm install -g wrangler

# Verify Wrangler installation
wrangler --version
```

### Cloudflare CLI Authentication

```bash
# Login to Cloudflare
wrangler login

# This will open a browser window
# Authorize Wrangler to access your account

# Verify authentication
wrangler whoami
```

## Local Development Setup

### 1. Clone the Repository

```bash
# Clone the repository
git clone https://github.com/myselfgus/remote-mcp-server-authless.git

# Navigate to directory
cd remote-mcp-server-authless
```

### 2. Install Dependencies

```bash
# Install all dependencies
npm install

# This installs:
# - @modelcontextprotocol/sdk@1.17.3
# - agents@^0.0.113
# - nanoid@^5.1.6
# - zod@^3.25.76
# - @biomejs/biome@^2.2.2 (dev)
# - typescript@5.9.2 (dev)
# - wrangler@^4.33.1 (dev)
```

### 3. Configure Local Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit .env file
nano .env  # or use your preferred editor
```

**`.env` Contents**:
```bash
# Development environment settings
# Add any required environment variables here

# Optional: API keys for external services
# OPENAI_API_KEY=your_key_here
# ANTHROPIC_API_KEY=your_key_here
```

### 4. Set Up Local D1 Database

```bash
# Create local D1 database
wrangler d1 create meta-mcp-db-local

# Note the database ID from output
# Add it to wrangler.jsonc under d1_databases

# Run migrations
wrangler d1 migrations apply meta-mcp-db-local --local
```

### 5. Create Local KV Namespace

```bash
# Create local KV namespace
wrangler kv:namespace create "KV" --preview

# Note the ID and add to wrangler.jsonc
```

### 6. Create Local R2 Bucket

```bash
# Create local R2 bucket
wrangler r2 bucket create meta-mcp-storage-local

# Add to wrangler.jsonc
```

### 7. Start Development Server

```bash
# Start local development server
npm run dev

# Or with Wrangler directly
wrangler dev

# Server will be available at:
# http://localhost:8787
```

### 8. Test Local Setup

```bash
# Health check
curl http://localhost:8787/health

# Expected response:
# {
#   "status": "ok",
#   "server": "MCP Remote Server Builder",
#   "version": "1.0.0"
# }

# Test SSE endpoint
curl http://localhost:8787/sse
```

### 9. Connect Claude Desktop (Local)

Edit `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "meta-mcp-local": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/sse"]
    }
  }
}
```

Restart Claude Desktop and verify the tools appear.

## Production Deployment

### Method 1: Quick Deploy via Wrangler

```bash
# From project directory
npm run deploy

# Or with Wrangler
wrangler deploy

# This will:
# 1. Build the TypeScript code
# 2. Upload to Cloudflare
# 3. Deploy to your Workers subdomain
# 4. Return deployment URL
```

**Output Example**:
```
✨  Built successfully
⛅️ Deploy Complete
https://meta-mcp.your-account.workers.dev
```

### Method 2: Custom Domain Deployment

#### Step 1: Add Custom Domain in Cloudflare Dashboard

1. Go to [dash.cloudflare.com](https://dash.cloudflare.com)
2. Select your account
3. Go to **Workers & Pages**
4. Find your deployed worker
5. Click **Settings** → **Triggers**
6. Click **Add Custom Domain**
7. Enter your domain (e.g., `api.yourdomain.com`)
8. Cloudflare will configure DNS automatically

#### Step 2: Update wrangler.jsonc

```json
{
  "name": "meta-mcp",
  "routes": [
    {
      "pattern": "api.yourdomain.com/*",
      "zone_name": "yourdomain.com"
    }
  ]
}
```

#### Step 3: Deploy

```bash
wrangler deploy
```

Your server will be available at `https://api.yourdomain.com/sse`

### Method 3: Deploy with One-Click Button

For new deployments:

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/myselfgus/remote-mcp-server-authless)

This will:
1. Fork the repository to your account
2. Set up Wrangler configuration
3. Deploy to your Cloudflare account
4. Configure all necessary resources

## Configuration

### wrangler.jsonc Configuration

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "meta-mcp",
  "main": "src/index.ts",
  
  // Compatibility settings
  "compatibility_date": "2025-03-10",
  "compatibility_flags": ["nodejs_compat"],
  
  // Environment variables
  "vars": {
    "CF_ACCESS_ENABLED": "false"
  },
  
  // Durable Objects migrations
  "migrations": [
    {
      "new_sqlite_classes": ["MetaMCP"],
      "tag": "v1"
    }
  ],
  
  // Durable Object bindings
  "durable_objects": {
    "bindings": [
      {
        "class_name": "MetaMCP",
        "name": "MCP_OBJECT"
      }
    ]
  },
  
  // D1 Database
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "meta-mcp-db",
      "database_id": "YOUR_DATABASE_ID"
    }
  ],
  
  // KV Namespace
  "kv_namespaces": [
    {
      "binding": "KV",
      "id": "YOUR_KV_ID"
    }
  ],
  
  // R2 Bucket
  "r2_buckets": [
    {
      "binding": "STORAGE",
      "bucket_name": "meta-mcp-storage"
    }
  ],
  
  // Service bindings (if using external services)
  "services": [
    {
      "binding": "WORKER_PUBLISHER",
      "service": "worker-publisher",
      "environment": "production"
    },
    {
      "binding": "CONTAINER_MANAGER",
      "service": "containers-manager",
      "environment": "production"
    },
    {
      "binding": "MCP_CLIENT",
      "service": "mcp-client",
      "environment": "production"
    }
  ],
  
  // Observability
  "observability": {
    "enabled": true
  }
}
```

### Multi-Environment Setup

Create environment-specific configurations:

**wrangler.dev.jsonc**:
```jsonc
{
  "name": "meta-mcp-dev",
  "vars": {
    "CF_ACCESS_ENABLED": "false",
    "ENVIRONMENT": "development"
  }
}
```

**wrangler.staging.jsonc**:
```jsonc
{
  "name": "meta-mcp-staging",
  "vars": {
    "CF_ACCESS_ENABLED": "false",
    "ENVIRONMENT": "staging"
  }
}
```

**wrangler.prod.jsonc**:
```jsonc
{
  "name": "meta-mcp",
  "vars": {
    "CF_ACCESS_ENABLED": "true",
    "ENVIRONMENT": "production"
  }
}
```

**Deploy to specific environment**:
```bash
# Development
wrangler deploy --config wrangler.dev.jsonc

# Staging
wrangler deploy --config wrangler.staging.jsonc

# Production
wrangler deploy --config wrangler.prod.jsonc
```

## Database Setup

### Create Production D1 Database

```bash
# Create D1 database
wrangler d1 create meta-mcp-db

# Output will show database ID
# Copy this ID to wrangler.jsonc
```

### Run Migrations

```bash
# List available migrations
wrangler d1 migrations list meta-mcp-db

# Apply migrations
wrangler d1 migrations apply meta-mcp-db

# Verify migrations
wrangler d1 execute meta-mcp-db --command "SELECT name FROM sqlite_master WHERE type='table'"
```

### Migration Files

**migrations/0001_initial_schema.sql**:
```sql
-- Create core tables
CREATE TABLE IF NOT EXISTS mcp_servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  worker_name TEXT,
  container_id TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  wrangler_config TEXT NOT NULL
);

CREATE INDEX idx_mcp_servers_updated ON mcp_servers(updated_at);

-- Additional tables...
```

### Backup Strategy

```bash
# Export database
wrangler d1 export meta-mcp-db --output backup.sql

# Import to new database
wrangler d1 execute meta-mcp-db-backup --file backup.sql
```

## Service Bindings

### Deploy Required Services

If using service bindings, deploy these services first:

#### 1. Worker Publisher Service

```bash
# Clone worker-publisher
git clone https://github.com/cloudflare/worker-publisher.git
cd worker-publisher

# Deploy
wrangler deploy

# Note the service name for binding
```

#### 2. Container Manager Service

```bash
# Clone containers-manager
git clone https://github.com/cloudflare/containers-manager.git
cd containers-manager

# Deploy
wrangler deploy
```

#### 3. MCP Client Service

```bash
# Clone mcp-client
git clone https://github.com/cloudflare/mcp-client.git
cd mcp-client

# Deploy
wrangler deploy
```

### Configure Service Bindings

Update `wrangler.jsonc`:

```jsonc
{
  "services": [
    {
      "binding": "WORKER_PUBLISHER",
      "service": "worker-publisher",
      "environment": "production",
      "entrypoint": "WorkerPublisherRPC"
    },
    {
      "binding": "CONTAINER_MANAGER",
      "service": "containers-manager",
      "environment": "production",
      "entrypoint": "ContainerManagerRPC"
    },
    {
      "binding": "MCP_CLIENT",
      "service": "mcp-client",
      "environment": "production",
      "entrypoint": "MCPClientRPC"
    }
  ]
}
```

## Environment Variables

### Set Secrets via Wrangler

```bash
# Set API keys (not visible in wrangler.jsonc)
wrangler secret put OPENAI_API_KEY
# Paste your key when prompted

wrangler secret put ANTHROPIC_API_KEY
# Paste your key

# List secrets (values are hidden)
wrangler secret list
```

### Access Secrets in Code

```typescript
// In your tool implementation
const apiKey = env.OPENAI_API_KEY;

const response = await fetch("https://api.openai.com/v1/chat/completions", {
  headers: {
    "Authorization": `Bearer ${apiKey}`
  }
});
```

### Environment-Specific Secrets

```bash
# Dev environment
wrangler secret put API_KEY --env dev

# Production environment
wrangler secret put API_KEY --env production
```

## Post-Deployment

### Verify Deployment

```bash
# 1. Health check
curl https://meta-mcp.your-account.workers.dev/health

# 2. Get server info
curl https://meta-mcp.your-account.workers.dev/

# 3. Test SSE endpoint
curl https://meta-mcp.your-account.workers.dev/sse
```

### Set Up Monitoring

#### 1. Enable Cloudflare Analytics

1. Go to Cloudflare Dashboard
2. Navigate to **Workers & Pages**
3. Select your worker
4. Go to **Metrics** tab
5. Enable **Workers Analytics Engine**

#### 2. Configure Alerts

1. In Dashboard, go to **Notifications**
2. Click **Add**
3. Select **Workers** category
4. Configure alerts for:
   - Error rate threshold
   - Request volume spikes
   - CPU time exceeded
   - Duration exceeded

#### 3. Set Up Logs

```bash
# Tail production logs in real-time
wrangler tail meta-mcp

# Filter for errors only
wrangler tail meta-mcp --status error

# Save logs to file
wrangler tail meta-mcp > logs.txt
```

### Configure CORS (if needed)

Already configured in code, but verify headers:

```typescript
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
```

### Set Up Custom Error Pages

Create custom error responses:

```typescript
// 404 Handler
if (url.pathname === "/404") {
  return new Response("Custom 404 Page", {
    status: 404,
    headers: { "Content-Type": "text/html" }
  });
}
```

## Continuous Deployment

### GitHub Actions Setup

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Cloudflare Workers

on:
  push:
    branches:
      - main
  pull_request:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    name: Deploy
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          
      - name: Install dependencies
        run: npm ci
        
      - name: Run tests
        run: npm test
        
      - name: Type check
        run: npm run type-check
        
      - name: Lint
        run: npm run lint:fix
        
      - name: Deploy to Cloudflare Workers
        uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

### Set Up GitHub Secrets

1. Go to repository **Settings** → **Secrets and variables** → **Actions**
2. Add secrets:
   - `CLOUDFLARE_API_TOKEN`: Get from Cloudflare Dashboard → My Profile → API Tokens
   - `CLOUDFLARE_ACCOUNT_ID`: Found in Cloudflare Dashboard URL

### Create API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use **Edit Cloudflare Workers** template
4. Or create custom with permissions:
   - Account: Workers Scripts: Edit
   - Account: Workers KV Storage: Edit
   - Account: D1: Edit
5. Copy token and add to GitHub secrets

### Deployment Workflow

```
Push to main
     ↓
GitHub Actions triggered
     ↓
Run tests
     ↓
Type check
     ↓
Lint code
     ↓
Deploy to Cloudflare
     ↓
Deployment successful
     ↓
Notification sent
```

### Staging Environment Workflow

```yaml
name: Deploy to Staging

on:
  push:
    branches:
      - develop

jobs:
  deploy-staging:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          environment: staging
```

## Rollback Procedures

### Version Tagging

```bash
# Before deployment, tag current version
git tag -a v1.0.0 -m "Production release 1.0.0"
git push origin v1.0.0
```

### Rollback to Previous Version

#### Method 1: Via Cloudflare Dashboard

1. Go to **Workers & Pages**
2. Select your worker
3. Go to **Deployments** tab
4. Find previous deployment
5. Click **Rollback**

#### Method 2: Via Wrangler

```bash
# List deployments
wrangler deployments list meta-mcp

# Rollback to specific version
wrangler rollback meta-mcp --version-id <deployment-id>
```

#### Method 3: Via Git

```bash
# Revert to previous commit
git checkout v1.0.0

# Deploy old version
wrangler deploy

# Return to main branch
git checkout main
```

### Emergency Rollback Script

Create `scripts/emergency-rollback.sh`:

```bash
#!/bin/bash

echo "🚨 Emergency Rollback Initiated"

# Get previous stable tag
PREV_TAG=$(git describe --tags --abbrev=0 HEAD^)

echo "Rolling back to: $PREV_TAG"

# Checkout previous version
git checkout $PREV_TAG

# Deploy
wrangler deploy

echo "✅ Rollback complete"
echo "🔄 Don't forget to investigate the issue!"
```

Make it executable:
```bash
chmod +x scripts/emergency-rollback.sh
```

Run in emergency:
```bash
./scripts/emergency-rollback.sh
```

### Blue-Green Deployment Strategy

1. **Deploy to new worker name**:
```bash
# Update wrangler.jsonc temporarily
{
  "name": "meta-mcp-v2"
}

# Deploy
wrangler deploy
```

2. **Test new version**:
```bash
curl https://meta-mcp-v2.your-account.workers.dev/health
```

3. **Switch traffic**:
   - Update DNS/routing
   - Or rename workers in dashboard

4. **Keep old version** for quick rollback

### Canary Deployment

Use Cloudflare Workers' traffic splitting:

1. Deploy new version to different name
2. In Dashboard, configure traffic split:
   - 90% → old version
   - 10% → new version
3. Monitor metrics
4. Gradually increase traffic to new version
5. Or rollback if issues detected

### Post-Rollback Checklist

- [ ] Verify service is operational
- [ ] Check error rates in dashboard
- [ ] Test critical endpoints
- [ ] Notify team of rollback
- [ ] Create incident report
- [ ] Plan fix for issue
- [ ] Schedule new deployment

---

## Troubleshooting Deployment Issues

### Issue: "Namespace not found"

**Solution**: Create the namespace first
```bash
wrangler kv:namespace create "KV"
```

### Issue: "D1 database not found"

**Solution**: Create and configure D1
```bash
wrangler d1 create meta-mcp-db
# Update database_id in wrangler.jsonc
```

### Issue: "Service binding not found"

**Solution**: Deploy required services first, or remove service bindings from config

### Issue: "Build failed"

**Solution**: Check TypeScript errors
```bash
npm run type-check
```

### Issue: "Deployment timed out"

**Solution**: 
- Check internet connection
- Verify Cloudflare API token
- Try again after a few minutes

### Issue: "Worker exceeded limits"

**Solution**: Upgrade to Workers Paid plan ($5/month)
- Removes CPU time limits
- Increases request limits
- Enables additional features

---

## Next Steps

After successful deployment:

1. **Configure monitoring**: Set up alerts and logging
2. **Test thoroughly**: Run through all tools
3. **Document**: Update team docs with deployment URLs
4. **Connect clients**: Configure Claude Desktop, etc.
5. **Monitor**: Watch metrics for first 24 hours
6. **Optimize**: Based on usage patterns

For detailed usage instructions, see [USER_MANUAL.md](USER_MANUAL.md).

For architecture details, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

**Deployment Complete!** 🎉 Your Meta-MCP Server is now live on Cloudflare's global edge network.
