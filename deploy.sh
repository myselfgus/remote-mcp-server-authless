#!/bin/bash

echo "🚀 Deploy do MCP Remote Server Builder"
echo ""
echo "Este script irá:"
echo "1. Fazer login no Wrangler (se necessário)"
echo "2. Fazer deploy do Worker para Cloudflare"
echo ""

# Fazer deploy
echo "Fazendo deploy..."
npx wrangler deploy

echo ""
echo "✅ Deploy concluído!"
echo ""
echo "📍 Seu servidor MCP estará disponível em:"
echo "   https://remote-mcp-server-authless.<your-account>.workers.dev/sse"
echo ""
echo "🔗 Para conectar:"
echo ""
echo "Claude Desktop:"
echo "  Edite: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "  Adicione:"
echo '  {
    "mcpServers": {
      "mcp-builder": {
        "command": "npx",
        "args": ["-y", "mcp-remote", "https://meta-mcp.voither.workers.dev/sse"]
      }
    }
  }'
echo ""
echo "Cloudflare AI Playground:"
echo "  1. Acesse: https://playground.ai.cloudflare.com/"
echo "  2. Conecte: https://meta-mcp.voither.workers.dev/sse"
echo ""
echo "⚠️  Nota: Claude.ai (web) não suporta MCP Remote"
echo "    Use Claude Desktop ou Cloudflare AI Playground"
