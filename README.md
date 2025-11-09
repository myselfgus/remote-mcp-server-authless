# MCP Remote Server Builder

> Um Meta-MCP Server que fornece ferramentas precisas para criar, configurar e fazer deploy de MCP Remote Servers diretamente via MCP para Cloudflare Workers.

## O que é isso?

Este é um **Meta-MCP Server** - um servidor MCP que fornece ferramentas para criar OUTROS servidores MCP! Com ele, você pode criar, configurar e fazer deploy de MCP Remote Servers completos usando apenas as ferramentas MCP, sem precisar escrever código manualmente.

## Deploy Rápido

[![Deploy to Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/cloudflare/ai/tree/main/demos/remote-mcp-authless)

Ou via linha de comando:

```bash
npm create cloudflare@latest -- mcp-builder --template=cloudflare/ai/demos/remote-mcp-authless
cd mcp-builder
npm install
npm run dev
```

Seu Meta-MCP Server estará disponível em: `http://localhost:8787/sse`

## 🔌 Como Conectar

### Opção 1: Claude Desktop (Recomendado)

Edite o arquivo de configuração do Claude Desktop:

**Localização do arquivo:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/claude/claude_desktop_config.json`

**Configuração para desenvolvimento local:**

```json
{
  "mcpServers": {
    "mcp-builder": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:8787/sse"]
    }
  }
}
```

**Configuração para produção:**

```json
{
  "mcpServers": {
    "mcp-builder": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://meta-mcp.voither.workers.dev/sse"]
    }
  }
}
```

**Depois de editar:** Reinicie o Claude Desktop completamente.

### Opção 2: Cloudflare AI Playground

1. Acesse [playground.ai.cloudflare.com](https://playground.ai.cloudflare.com/)
2. Clique em "Connect MCP Server"
3. Digite a URL: `https://meta-mcp.voither.workers.dev/sse`
4. Pronto! As 10 ferramentas estarão disponíveis

### Opção 3: Linha de Comando (Teste)

```bash
# Local
npx -y mcp-remote http://localhost:8787/sse

# Produção
npx -y mcp-remote https://meta-mcp.voither.workers.dev/sse
```

### ✅ Verificar Conexão

```bash
# Health check
curl http://localhost:8787/health

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

## Segurança e Autenticação

Este servidor implementa **validação de JWT do Cloudflare Access** para garantir que apenas usuários autorizados possam acessar as ferramentas MCP.

### Configuração do Cloudflare Access

O servidor está configurado para validar tokens JWT em todas as requisições quando deployado em produção. A autenticação é feita através do Cloudflare Access com os seguintes parâmetros:

- **Team Domain**: `voither.cloudflareaccess.com`
- **Audience (AUD)**: `0f2923c24cec6a2ee1f63570394014228d05e00dab403548f82c65eb9c7a63f3`
- **JWKs URL**: `https://voither.cloudflareaccess.com/cdn-cgi/access/certs`

### Variáveis de Ambiente

Configure as seguintes variáveis de ambiente:

```bash
# Habilitar/desabilitar autenticação
CF_ACCESS_ENABLED=true

# Seu domínio do Cloudflare Access
CF_ACCESS_TEAM_DOMAIN=voither.cloudflareaccess.com

# Application Audience (AUD) tag
CF_ACCESS_AUDIENCE=0f2923c24cec6a2ee1f63570394014228d05e00dab403548f82c65eb9c7a63f3
```

### Desenvolvimento Local

Para desenvolvimento local, a autenticação está **desabilitada por padrão** através do arquivo `.dev.vars`:

```bash
# .dev.vars
CF_ACCESS_ENABLED=false
```

Para testar a autenticação localmente, altere para `CF_ACCESS_ENABLED=true` no `.dev.vars`.

### Como Funciona

1. **Validação de Header**: O servidor verifica o header `CF-Access-JWT-Assertion` em cada requisição
2. **Verificação de Assinatura**: O JWT é validado usando as chaves públicas do Cloudflare Access
3. **Validação de Claims**: Verifica audience (AUD) e expiração (exp)
4. **Cache de Chaves**: As chaves públicas são cacheadas por 1 hora para performance

### Gerenciar Políticas

Para gerenciar quem pode acessar o servidor:
1. Acesse [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Vá em **Access** > **Applications**
3. Configure as políticas de acesso para `meta-mcp.voither.workers.dev`

## Ferramentas Disponíveis

O Meta-MCP Server fornece 10 ferramentas poderosas:

### 1. `create_mcp_server`
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
