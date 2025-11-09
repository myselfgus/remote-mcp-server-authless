# Como Conectar ao Meta-MCP Server

## URLs do Servidor

**Desenvolvimento Local:**
- URL Base: `http://localhost:8787`
- SSE Endpoint: `http://localhost:8787/sse`
- MCP Endpoint: `http://localhost:8787/mcp`
- Health Check: `http://localhost:8787/health`

**Produção (Cloudflare Workers):**
- URL Base: `https://meta-mcp.voither.workers.dev`
- SSE Endpoint: `https://meta-mcp.voither.workers.dev/sse`
- MCP Endpoint: `https://meta-mcp.voither.workers.dev/mcp`

## Método 1: Claude Desktop (Recomendado)

Edite seu arquivo de configuração do Claude Desktop:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
**Linux:** `~/.config/claude/claude_desktop_config.json`

### Configuração para Desenvolvimento Local:

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

### Configuração para Produção:

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

**Nota:** O argumento `-y` faz o npx instalar automaticamente o pacote sem perguntar.

## Método 2: Linha de Comando (Teste Rápido)

### Testar localmente:

```bash
npx -y mcp-remote http://localhost:8787/sse
```

### Testar em produção:

```bash
npx -y mcp-remote https://meta-mcp.voither.workers.dev/sse
```

## Método 3: ChatGPT (Via URL Pública)

Para usar com ChatGPT, você precisa de uma URL pública. Após fazer deploy:

1. Acesse [ChatGPT](https://chat.openai.com/)
2. Vá em Settings > Beta Features
3. Ative "Model Context Protocol"
4. Adicione servidor: `https://meta-mcp.voither.workers.dev/sse`

**Nota:** ChatGPT pode ter limitações específicas de MCP.

## Método 4: Cloudflare AI Playground

1. Acesse [Cloudflare AI Playground](https://playground.ai.cloudflare.com/)
2. Clique em "Connect MCP Server"
3. Digite: `https://meta-mcp.voither.workers.dev/sse`
4. As ferramentas aparecerão automaticamente!

## Verificar Conexão

### 1. Verificar se o servidor está rodando:

```bash
curl http://localhost:8787/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "server": "MCP Remote Server Builder",
  "version": "1.0.0",
  "timestamp": "2025-11-09T06:13:53.372Z"
}
```

### 2. Verificar informações do servidor:

```bash
curl http://localhost:8787/
```

Resposta esperada:
```json
{
  "name": "MCP Remote Server Builder",
  "version": "1.0.0",
  "description": "Meta-MCP Server for creating and deploying MCP Remote Servers",
  "endpoints": {
    "sse": "/sse (Server-Sent Events transport)",
    "mcp": "/mcp (HTTP POST transport)",
    "health": "/health (Health check)",
    "message": "/sse/message (SSE message endpoint)"
  },
  "authentication": "disabled",
  "usage": {
    "claude_desktop": "Add to config: { \"command\": \"npx\", \"args\": [\"mcp-remote\", \"URL/sse\"] }",
    "direct_connection": "Connect to /sse endpoint for Server-Sent Events"
  }
}
```

### 3. Testar SSE endpoint:

```bash
curl -N http://localhost:8787/sse
```

Você deve ver uma conexão SSE estabelecida.

## Solução de Problemas

### Erro: "Connection refused"

**Problema:** Servidor não está rodando
**Solução:**
```bash
cd /caminho/para/remote-mcp-server-authless
npm run dev
```

### Erro: "Invalid URL" no Claude Desktop

**Problema:** URL malformada
**Soluções:**
- Verifique se a URL tem `http://` ou `https://`
- Use `/sse` no final: `http://localhost:8787/sse`
- Para produção: `https://meta-mcp.voither.workers.dev/sse`

### Erro: "Unauthorized" em Produção

**Problema:** Cloudflare Access bloqueando
**Solução:**
1. Faça login no Cloudflare Access
2. Ou desabilite temporariamente: edite `wrangler.jsonc` e mude `CF_ACCESS_ENABLED` para `"false"`

### Claude Desktop não mostra as ferramentas

**Soluções:**
1. **Reinicie o Claude Desktop completamente** (feche e abra novamente)
2. Verifique os logs do Claude Desktop:
   - macOS: `~/Library/Logs/Claude/`
   - Windows: `%APPDATA%\Claude\logs\`
3. Verifique se o `mcp-remote` foi instalado:
   ```bash
   npx mcp-remote --version
   ```
4. Teste a URL manualmente:
   ```bash
   curl http://localhost:8787/health
   ```

### ChatGPT não reconhece

**Possíveis causas:**
- ChatGPT pode não suportar todos os tipos de servidores MCP
- A URL deve ser pública (não `localhost`)
- Pode precisar de configuração específica do OpenAI

**Recomendação:** Use Claude Desktop ou Cloudflare AI Playground para melhor compatibilidade.

## Ferramentas Disponíveis

Após conectar, você terá acesso a 10 ferramentas:

1. **create_mcp_server** - Cria novo MCP server
2. **add_mcp_tool** - Adiciona ferramenta ao server
3. **add_mcp_resource** - Adiciona resource
4. **add_mcp_prompt** - Adiciona prompt template
5. **configure_wrangler** - Configura deployment
6. **get_mcp_server_code** - Gera código completo
7. **list_mcp_servers** - Lista servers criados
8. **delete_mcp_server** - Remove server
9. **get_mcp_server_details** - Mostra detalhes
10. **get_deployment_instructions** - Instruções de deploy

## Exemplo de Uso

Após conectar no Claude Desktop, você pode fazer:

```
Crie um MCP server chamado "weather-api" que fornece informações de clima
```

O Claude usará as ferramentas para criar o server completo!

## Deploy para Produção

```bash
# 1. Build
npm run type-check

# 2. Deploy
npm run deploy

# 3. Sua URL será:
# https://remote-mcp-server-authless.<your-account>.workers.dev/sse
```

Depois do deploy, atualize a configuração do Claude Desktop com a nova URL.
