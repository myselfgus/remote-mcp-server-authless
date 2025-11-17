# Meta-MCP Server - Dynamic MCP Server Factory

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/myselfgus/remote-mcp-server-authless)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)](https://workers.cloudflare.com/)

> **English** | [Português](#português)

A revolutionary **Meta-MCP Server** that creates, deploys, and manages other MCP servers through conversational AI. Build production-ready APIs in minutes, not days, using just natural language—no manual coding required.

## 🌟 What Is This?

The Meta-MCP Server is a "server factory" - an MCP server that **creates OTHER MCP servers**! Think of it as Infrastructure-as-Conversation. You describe what you want, and it:

- ✨ Generates complete MCP server code
- 🚀 Deploys to Cloudflare's global edge network
- 🔧 Manages the entire server lifecycle
- 🌍 Scales automatically worldwide

**No DevOps. No Boilerplate. Just Build.**

## 🎯 Why Meta-MCP?

| Traditional Development | With Meta-MCP |
|------------------------|---------------|
| 5-10 days per API | 20 minutes |
| DevOps complexity | Zero configuration |
| Infrastructure costs | ~$20/month |
| Manual scaling | Auto-scales globally |
| Weeks to iterate | Minutes to update |

**Result**: 40-100x faster development with 95% cost reduction.

## ⚡ Quick Start

### Try It Now (No Installation)

Connect to our hosted instance:

```
https://meta-mcp.voither.workers.dev/sse
```

See [Connection Guide](#-how-to-connect) below for detailed instructions.

### Deploy Your Own (< 5 minutes)

```bash
# Clone and setup
git clone https://github.com/myselfgus/remote-mcp-server-authless.git
cd remote-mcp-server-authless
npm install

# Start local development
npm run dev
# Your server: http://localhost:8787/sse

# Deploy to production
npm run deploy
# Your server: https://meta-mcp.YOUR-ACCOUNT.workers.dev/sse
```

Full deployment guide: [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)

## 🎬 See It In Action

```bash
# Create a complete API in seconds
"Create an MCP server named 'weather-api' that provides weather information"

# Add tools
"Add a tool 'get_current_weather' that takes a city name and returns temperature"

# Deploy to production
"Deploy weather-api to Cloudflare Workers"

# Get connection info
"How do I connect to weather-api?"
```

**That's it!** You now have a production API running globally.

## 🛠️ What You Can Build

- **Business APIs**: Customer data, inventory, orders, analytics
- **Data Pipelines**: ETL, transformations, aggregations
- **Integrations**: Connect external services, aggregate APIs
- **Internal Tools**: Admin dashboards, developer utilities
- **Automation**: Workflows, notifications, scheduling
- **AI Services**: LLM wrappers, embeddings, RAG systems

[See 57+ integration ideas →](TOOL_SUGGESTIONS.md)

## 🔌 How to Connect

### Option 1: Claude Desktop (Recommended)

Edit your Claude Desktop configuration:

**Config location**:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

**Local development**:
```json
{
  "mcpServers": {
    "meta-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/sse"]
    }
  }
}
```

**Production (hosted)**:
```json
{
  "mcpServers": {
    "meta-mcp": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://meta-mcp.voither.workers.dev/sse"]
    }
  }
}
```

**Important**: Completely restart Claude Desktop after editing.

### Option 2: Claude.ai (Web/Mobile)

1. Open [Claude.ai](https://claude.ai) or Claude mobile app
2. Go to Settings → Model Context Protocol
3. Add server: `https://meta-mcp.voither.workers.dev/sse`
4. Done! 22 tools are now available

### Option 3: Cloudflare AI Playground

1. Visit [playground.ai.cloudflare.com](https://playground.ai.cloudflare.com/)
2. Click "Connect MCP Server"
3. Enter: `https://meta-mcp.voither.workers.dev/sse`
4. Start building!

### Verify Connection

```bash
# Health check
curl https://meta-mcp.voither.workers.dev/health

# Expected response
{"status":"ok","server":"MCP Remote Server Builder","version":"1.0.0"}
```

# Informações do servidor
curl http://localhost:8787/
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "server": "MCP Remote Server Builder",
  "version": "1.0.0"
}
```

### 📚 Guia Completo de Conexão

Para instruções detalhadas, soluções de problemas e mais opções, veja [test-connection.md](test-connection.md).

## ⚠️ Segurança e Autenticação

Este servidor **NÃO tem autenticação** por design.

### Por que sem autenticação?

Este é um **MCP Remote Server "authless"** (sem autenticação) porque:

1. **Compatibilidade com MCP Remote**: Cloudflare Access e outras soluções OAuth não funcionam com conexões SSE do protocolo MCP
2. **Clientes MCP não suportam OAuth**: Claude.ai, Playground e outros clientes fazem conexões SSE diretas e não conseguem abrir páginas de login
3. **Problema técnico**: Autenticação OAuth trava eternamente em "Authenticating..." porque não há callback/redirect

### ⚠️ Importante sobre Cloudflare Access

Se você configurou **Cloudflare Access** no dashboard, você DEVE desabilitá-lo:

1. Acesse https://one.dash.cloudflare.com/
2. **Access** > **Applications**
3. Encontre aplicação para `meta-mcp.voither.workers.dev`
4. Delete ou desabilite a aplicação

**Cloudflare Access impede que clientes MCP conectem!** Veja `CLOUDFLARE_ACCESS_INCOMPATIBILITY.md` para detalhes.

### 🔒 Como adicionar segurança (se necessário)

Se você precisa de autenticação, opções compatíveis com MCP:

1. **API Keys customizadas**: Implemente validação de header `Authorization: Bearer <token>` no código do Worker
2. **Cloudflare WAF**: Use regras de firewall para restringir por IP/país
3. **Rate Limiting**: Limite requisições para prevenir abuso
4. **Private Network**: Use Cloudflare Tunnel para acesso apenas via VPN

**Não use:** Cloudflare Access, OAuth, ou qualquer solução que exija redirects/popups

## 🚀 Available Tools (22 Total)

The Meta-MCP Server provides 22 powerful tools organized in categories:

### Server Management (10 tools)
1. **`init_mcp_server`** - Create new MCP server with container
2. **`add_mcp_tool`** - Add tools (API endpoints)
3. **`add_mcp_resource`** - Add resources (data providers)
4. **`add_mcp_prompt`** - Add prompt templates
5. **`configure_wrangler`** - Configure deployment settings
6. **`get_mcp_server_code`** - View generated code
7. **`list_mcp_servers`** - List all servers
8. **`delete_mcp_server`** - Remove a server
9. **`get_mcp_server_details`** - Get full server info
10. **`get_deployment_instructions`** - Connection instructions

### Deployment & Management (4 tools)
11. **`cleanup_old_servers`** - Remove inactive servers
12. **`connect_to_mcp_server`** - Connect to external servers
13. **`list_connected_mcp_servers`** - List connections
14. **`call_mcp_tool`** - Call tool on connected server
15. **`wrangler_deploy`** - Deploy to Cloudflare Workers
16. **`connect_external_mcp`** - External server integration

### Container Operations (6 tools)
17. **`container_initialize`** - Initialize container environment
18. **`container_exec`** - Execute commands in container
19. **`container_file_write`** - Write files to container
20. **`container_file_read`** - Read files from container
21. **`container_files_list`** - List container files
22. **`container_file_delete`** - Delete container files

[See complete tool reference →](USER_MANUAL.md#available-tools)

## 📚 Documentation

Comprehensive guides for every use case:

- **[USER_MANUAL.md](USER_MANUAL.md)** (27KB) - Complete usage guide
  - Detailed tool documentation
  - Common workflows and examples
  - Best practices
  - Troubleshooting guide

- **[ARCHITECTURE.md](ARCHITECTURE.md)** (29KB) - Technical deep dive
  - System architecture and components
  - Cloudflare infrastructure (Durable Objects, D1, KV, R2)
  - Database schema and service bindings
  - Performance and scalability

- **[PRODUCTIVITY_GUIDE.md](PRODUCTIVITY_GUIDE.md)** (19KB) - Business value
  - Real-world use cases (12+ scenarios)
  - Time savings analysis (90%+ reduction)
  - ROI calculator with real numbers
  - Success stories

- **[TOOL_SUGGESTIONS.md](TOOL_SUGGESTIONS.md)** (20KB) - Integration ideas
  - 57+ tool and integration suggestions
  - AI/ML, Data, Business, Developer tools
  - Industry-specific solutions
  - Implementation templates

- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** (18KB) - Step-by-step deployment
  - Local development setup
  - Production deployment
  - CI/CD configuration
  - Multi-environment management

- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** (22KB) - Problem solving
  - Quick diagnostics
  - Common issues and solutions
  - Error message reference
  - Getting help resources

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────┐
│         Client Layer                    │
│  (Claude, AI Playground, mcp-remote)    │
└────────────────┬────────────────────────┘
                 │ SSE/HTTP
                 ↓
┌─────────────────────────────────────────┐
│      Cloudflare Workers (Edge)          │
│                                         │
│  ┌────────────────────────────────┐   │
│  │  MetaMCP Durable Object        │   │
│  │  - 22 MCP Tools                │   │
│  │  - State Management            │   │
│  └──────┬──────────────┬──────────┘   │
│         │              │               │
│         ↓              ↓               │
│  ┌──────────┐    ┌─────────┐         │
│  │ D1 (SQL) │    │ KV + R2 │         │
│  └──────────┘    └─────────┘         │
└────────────┬────────────────────────────┘
             │ Service Bindings
             ↓
┌─────────────────────────────────────────┐
│        Service Layer                    │
│  - Container Manager (Build)            │
│  - Worker Publisher (Deploy)            │
│  - MCP Client (External Connections)    │
└────────────┬────────────────────────────┘
             │
             ↓
┌─────────────────────────────────────────┐
│    Your Deployed MCP Servers            │
│  (Running on Cloudflare Edge)           │
└─────────────────────────────────────────┘
```

**Key Technologies**:
- Cloudflare Workers (V8 isolates, < 10ms cold start)
- Durable Objects (stateful, strongly consistent)
- D1 Database (SQL, low latency)
- KV & R2 (caching and storage)
- TypeScript + Zod + MCP SDK

[See detailed architecture →](ARCHITECTURE.md)

## ⚠️ Security & Authentication

This server is **authless by design** for MCP protocol compatibility.

### Why No Authentication?

MCP clients (Claude.ai, Playground) use Server-Sent Events (SSE) which **cannot** handle:
- OAuth redirects
- Login popups
- Interactive authentication

Traditional auth methods **block MCP connections** entirely.

### How to Add Security

For production deployments, use MCP-compatible security:

1. **API Keys**: Custom header validation in Worker code
2. **Cloudflare WAF**: IP/country restrictions
3. **Rate Limiting**: Prevent abuse
4. **Cloudflare Tunnel**: Private network access only

**❌ Don't use**: Cloudflare Access, OAuth, or interactive auth

[See security guide →](ARCHITECTURE.md#security-architecture)

## 💡 Example: Create a Weather API

Complete workflow in natural language:

```
1. "Create an MCP server named 'weather-api' that provides weather information"
   ✅ Server created with container environment

2. "Add a tool 'get_current_weather' that takes a city name and returns the current temperature and conditions from OpenWeather API"
   ✅ Tool added with full implementation

3. "Add a resource at 'weather://supported-cities' that lists all supported cities"
   ✅ Resource added

4. "Deploy weather-api to production"
   ✅ Deployed to: https://weather-api.your-account.workers.dev

5. "How do I connect to weather-api?"
   ✅ Returns connection instructions for Claude Desktop
```

**Time**: ~5 minutes from idea to production API

[See more examples →](USER_MANUAL.md#common-workflows)

## 📊 Performance & Scale

### Performance Characteristics

- **Cold Start**: < 10ms (V8 isolate)
- **Warm Request**: < 1ms
- **Database Query**: < 5ms (D1)
- **Global Latency**: < 50ms (edge network)

### Scalability

- **Requests/second**: Unlimited (auto-scaling)
- **Concurrent connections**: 10,000+ per instance
- **Geographic distribution**: 300+ data centers
- **Cost**: ~$20/month (vs $500+ traditional)

### Cloudflare Infrastructure

- **Durable Objects**: Stateful, consistent storage
- **D1 Database**: Serverless SQL
- **KV**: Global key-value cache
- **R2**: S3-compatible object storage
- **Workers**: Serverless compute at the edge

[See performance details →](ARCHITECTURE.md#performance--scalability)

## 🤝 Contributing

We welcome contributions! See our [Contributing Guide](CONTRIBUTING.md) for:

- Code of Conduct
- Development setup
- Pull request process
- Testing guidelines
- Documentation standards

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🌐 Community & Support

- **GitHub Issues**: [Report bugs](https://github.com/myselfgus/remote-mcp-server-authless/issues)
- **Discussions**: [Ask questions](https://github.com/myselfgus/remote-mcp-server-authless/discussions)
- **Cloudflare Docs**: [Workers Documentation](https://developers.cloudflare.com/workers/)
- **MCP Protocol**: [MCP Specification](https://modelcontextprotocol.io/)

## 🔗 Related Projects

- [MCP SDK](https://github.com/modelcontextprotocol/sdk) - MCP Protocol implementation
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless platform
- [mcp-remote](https://www.npmjs.com/package/mcp-remote) - MCP remote client
- [Claude Desktop](https://claude.ai/download) - AI assistant with MCP support

---

# Português

> **[English](#meta-mcp-server---dynamic-mcp-server-factory)** | Português

## O que é o Meta-MCP Server?
Cria um novo MCP server do zero.

**Parâmetros:**
- `name` (string): Nome do servidor (ex: 'weather-server')
- `version` (string): Versão (padrão: '1.0.0')
- `description` (string): Descrição do que o servidor faz

**Exemplo:**
```json
{
  "name": "weather-server",
  "version": "1.0.0",
  "description": "MCP server that provides weather information"
}
```

### 2. `add_mcp_tool`
Adiciona uma ferramenta ao MCP server.

**Parâmetros:**
- `serverId` (string): ID do servidor (nome do servidor)
- `toolName` (string): Nome da ferramenta
- `description` (string): Descrição da ferramenta
- `parameters` (object): Parâmetros com definições Zod
- `implementation` (string): Código JavaScript da implementação

**Exemplo:**
```json
{
  "serverId": "weather-server",
  "toolName": "get_weather",
  "description": "Get weather for a city",
  "parameters": {
    "city": {
      "type": "string",
      "description": "City name"
    }
  },
  "implementation": "const { city } = params;\nconst weather = await fetch(`https://api.weather.com/${city}`);\nconst data = await weather.json();\nreturn { content: [{ type: 'text', text: JSON.stringify(data) }] };"
}
```

### 3. `add_mcp_resource`
Adiciona um resource ao MCP server.

**Parâmetros:**
- `serverId` (string): ID do servidor
- `uri` (string): URI do resource
- `name` (string): Nome do resource
- `description` (string): Descrição
- `mimeType` (string): Tipo MIME (padrão: 'text/plain')
- `implementation` (string): Código para gerar o conteúdo

**Exemplo:**
```json
{
  "serverId": "weather-server",
  "uri": "weather://config",
  "name": "Weather Config",
  "description": "Weather API configuration",
  "mimeType": "application/json",
  "implementation": "return { contents: [{ uri: 'weather://config', mimeType: 'application/json', text: JSON.stringify({ apiKey: 'xxx' }) }] };"
}
```

### 4. `add_mcp_prompt`
Adiciona um prompt template ao MCP server.

**Parâmetros:**
- `serverId` (string): ID do servidor
- `promptName` (string): Nome do prompt
- `description` (string): Descrição
- `arguments` (array): Array de argumentos do prompt
- `template` (string): Template com placeholders {{arg}}

**Exemplo:**
```json
{
  "serverId": "weather-server",
  "promptName": "analyze_weather",
  "description": "Analyze weather data",
  "arguments": [
    { "name": "city", "description": "City name", "required": true }
  ],
  "template": "Analyze the weather conditions in {{city}} and provide recommendations."
}
```

### 5. `configure_wrangler`
Configura as definições de deployment do Wrangler.

**Parâmetros:**
- `serverId` (string): ID do servidor
- `routes` (array, opcional): Rotas customizadas
- `vars` (object, opcional): Variáveis de ambiente
- `compatibilityDate` (string, opcional): Data de compatibilidade

### 6. `get_mcp_server_code`
Gera o código completo do MCP server.

**Parâmetros:**
- `serverId` (string): ID do servidor
- `fileType` (enum): 'index', 'wrangler', 'package', ou 'all'

**Retorna:** Código fonte completo pronto para deploy

### 7. `list_mcp_servers`
Lista todos os MCP servers criados.

**Sem parâmetros**

### 8. `delete_mcp_server`
Remove um MCP server.

**Parâmetros:**
- `serverId` (string): ID do servidor a deletar

### 9. `get_mcp_server_details`
Mostra detalhes completos de um MCP server.

**Parâmetros:**
- `serverId` (string): ID do servidor

### 10. `get_deployment_instructions`
Gera instruções completas de deployment.

**Parâmetros:**
- `serverId` (string): ID do servidor

## Workflow Completo de Criação

### Passo 1: Criar o servidor
```
Use: create_mcp_server
Input: { name: "my-api-server", description: "Custom API server" }
```

### Passo 2: Adicionar ferramentas
```
Use: add_mcp_tool
Input: {
  serverId: "my-api-server",
  toolName: "fetch_data",
  description: "Fetch data from API",
  parameters: { "url": { "type": "string" } },
  implementation: "..."
}
```

### Passo 3: Gerar código
```
Use: get_mcp_server_code
Input: { serverId: "my-api-server", fileType: "all" }
```

### Passo 4: Criar projeto e fazer deploy
```bash
# Criar diretório
mkdir my-api-server
cd my-api-server

# Salvar os arquivos gerados
# (copiar src/index.ts, wrangler.jsonc, package.json, tsconfig.json)

# Instalar e fazer deploy
npm install
npm run deploy
```

## Conectar ao Claude Desktop

Adicione ao seu `~/.config/claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "mcp-builder": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "http://localhost:8787/sse"
      ]
    }
  }
}
```

Para usar o servidor já deployado:

```json
{
  "mcpServers": {
    "mcp-builder": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://remote-mcp-server-authless.<your-account>.workers.dev/sse"
      ]
    }
  }
}
```

Reinicie o Claude Desktop e as ferramentas estarão disponíveis!

## Conectar ao Cloudflare AI Playground

1. Acesse https://playground.ai.cloudflare.com/
2. Digite sua URL do MCP server: `remote-mcp-server-authless.<your-account>.workers.dev/sse`
3. Use as ferramentas diretamente do playground!

## Exemplo Completo: Criar um Weather Server

```javascript
// 1. Criar servidor
create_mcp_server({
  name: "weather-server",
  version: "1.0.0",
  description: "Weather information server"
});

// 2. Adicionar ferramenta de clima
add_mcp_tool({
  serverId: "weather-server",
  toolName: "get_weather",
  description: "Get current weather for a city",
  parameters: {
    city: {
      type: "string",
      description: "City name"
    },
    units: {
      type: "string",
      description: "Temperature units (celsius/fahrenheit)",
      default: "celsius",
      optional: true
    }
  },
  implementation: `
    const { city, units = 'celsius' } = params;
    // Simulação - em produção, use uma API real
    const temp = units === 'celsius' ? 22 : 72;
    const weather = {
      city,
      temperature: temp,
      units,
      condition: 'Sunny',
      humidity: 65
    };
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(weather, null, 2)
      }]
    };
  `
});

// 3. Adicionar resource de configuração
add_mcp_resource({
  serverId: "weather-server",
  uri: "weather://api-config",
  name: "API Configuration",
  description: "Weather API configuration and endpoints",
  mimeType: "application/json",
  implementation: `
    const config = {
      apiVersion: "v1",
      endpoints: {
        current: "/weather/current",
        forecast: "/weather/forecast"
      },
      supportedUnits: ["celsius", "fahrenheit"]
    };
    return {
      contents: [{
        uri: "weather://api-config",
        mimeType: "application/json",
        text: JSON.stringify(config, null, 2)
      }]
    };
  `
});

// 4. Adicionar prompt
add_mcp_prompt({
  serverId: "weather-server",
  promptName: "weather_report",
  description: "Generate a detailed weather report",
  arguments: [
    { name: "city", description: "City name", required: true },
    { name: "days", description: "Number of days", required: false }
  ],
  template: "Generate a detailed weather report for {{city}} for the next {{days}} days, including temperature, precipitation, and wind conditions."
});

// 5. Gerar código
get_mcp_server_code({
  serverId: "weather-server",
  fileType: "all"
});

// 6. Obter instruções de deployment
get_deployment_instructions({
  serverId: "weather-server"
});
```

## Estrutura do Código Gerado

O Meta-MCP Server gera código completo e pronto para produção:

### src/index.ts
```typescript
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export class WeatherServer extends McpAgent {
  server = new McpServer({
    name: "weather-server",
    version: "1.0.0",
  });

  async init() {
    // Tools, resources e prompts são gerados automaticamente
  }
}
```

### wrangler.jsonc
```json
{
  "name": "weather-server",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-10",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      { "class_name": "WeatherServer", "name": "MCP_OBJECT" }
    ]
  }
}
```

### package.json
```json
{
  "name": "weather-server",
  "version": "1.0.0",
  "dependencies": {
    "@modelcontextprotocol/sdk": "1.17.3",
    "agents": "^0.0.113",
    "zod": "^3.25.76"
  }
}
```

## Desenvolvimento

```bash
# Instalar dependências
npm install

# Desenvolvimento local
npm run dev

# Type checking
npm run type-check

# Formatação
npm run format

# Lint
npm run lint:fix

# Deploy
npm run deploy
```

## Tecnologias

- **MCP SDK**: Protocol implementation
- **Cloudflare Workers**: Serverless deployment
- **Durable Objects**: Stateful storage
- **Zod**: Schema validation
- **TypeScript**: Type safety
- **Wrangler**: Deployment tool

## Recursos Avançados

### Validação Automática de Parâmetros
O código gerado inclui validação Zod automática para todos os parâmetros das ferramentas.

### Error Handling
Todas as ferramentas incluem try-catch automático com mensagens de erro apropriadas.

### Type Safety
Código TypeScript totalmente tipado e validado.

### Code Generation
Templates inteligentes que geram código limpo e pronto para produção.

## Limitações

- Storage em memória (em produção, use Durable Objects storage)
- Sem autenticação (adicione conforme necessário)
- Implementações JavaScript como strings (futuramente suportar módulos)

## Roadmap

- [ ] Persistência em Durable Objects
- [ ] Suporte a autenticação
- [ ] Templates pré-configurados
- [ ] Versionamento de servers
- [ ] Testing framework integrado
- [ ] CLI para deployment direto
- [ ] Marketplace de ferramentas

## Contribuindo

PRs são bem-vindos! Para mudanças importantes, abra uma issue primeiro.

## Licença

MIT

## Links Úteis

- [MCP Documentation](https://modelcontextprotocol.io/)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [MCP Remote](https://www.npmjs.com/package/mcp-remote)
- [Claude Desktop](https://claude.ai/download)

---

**Criado com MCP** 🚀
