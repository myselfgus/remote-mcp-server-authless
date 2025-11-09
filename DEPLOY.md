# Guia de Deploy para Cloudflare Workers

## Pré-requisitos

1. Conta no Cloudflare
2. Node.js instalado
3. Wrangler CLI instalado (já incluído no projeto)

## Passo 1: Login no Wrangler

```bash
npx wrangler login
```

Isso abrirá seu navegador para autenticar com o Cloudflare. Siga as instruções na tela.

## Passo 2: Verificar Configuração

Verifique se o `wrangler.jsonc` está configurado corretamente:

```bash
cat wrangler.jsonc
```

Certifique-se de que o nome do worker está correto.

## Passo 3: Build e Type Check

```bash
# Verificar tipos
npm run type-check

# Testar localmente
npm run dev
```

Acesse `http://localhost:8787/health` para verificar se está funcionando.

## Passo 4: Deploy

```bash
npm run deploy
```

Ou com wrangler diretamente:

```bash
npx wrangler deploy
```

## Passo 5: Verificar Deploy

Após o deploy, você verá uma URL como:

```
https://remote-mcp-server-authless.<your-account>.workers.dev
```

Teste os endpoints:

```bash
# Health check
curl https://remote-mcp-server-authless.<your-account>.workers.dev/health

# Server info
curl https://remote-mcp-server-authless.<your-account>.workers.dev/

# MCP endpoint
curl https://remote-mcp-server-authless.<your-account>.workers.dev/sse
```

## Configurar Cloudflare Access (Opcional)

Se você quiser proteger o servidor com autenticação:

1. Acesse [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Vá em **Access** > **Applications**
3. Crie uma nova aplicação
4. Configure:
   - Application Domain: `meta-mcp.voither.workers.dev` (ou seu domínio)
   - Policy: Quem pode acessar
5. Copie o **Application Audience (AUD)**
6. Atualize `wrangler.jsonc`:

```json
{
  "vars": {
    "CF_ACCESS_ENABLED": "true",
    "CF_ACCESS_TEAM_DOMAIN": "seu-team.cloudflareaccess.com",
    "CF_ACCESS_AUDIENCE": "seu-audience-token"
  }
}
```

7. Faça deploy novamente:

```bash
npm run deploy
```

## Desabilitar Autenticação

Para desabilitar autenticação (não recomendado para produção):

```json
{
  "vars": {
    "CF_ACCESS_ENABLED": "false"
  }
}
```

## Troubleshooting

### Erro: "Unable to authenticate request"

**Solução:**
```bash
npx wrangler logout
npx wrangler login
```

### Erro: "The origin has unexpectedly closed the connection"

**Possíveis causas:**
1. Worker crashando
2. Erro no código
3. Timeout

**Soluções:**
1. Verifique os logs:
   ```bash
   npx wrangler tail
   ```

2. Teste localmente primeiro:
   ```bash
   npm run dev
   ```

3. Verifique se o tipo está correto:
   ```bash
   npm run type-check
   ```

### Erro: "Deployment failed"

**Solução:**
```bash
# Limpar cache
rm -rf node_modules .wrangler
npm install

# Tentar novamente
npm run deploy
```

## Ver Logs em Tempo Real

```bash
npx wrangler tail
```

Isso mostrará logs do Worker em tempo real. Útil para debug.

## Rollback de Deploy

Se algo der errado, você pode fazer rollback:

```bash
npx wrangler rollback
```

## Domínio Customizado

Para usar um domínio customizado:

1. Adicione o domínio no Cloudflare
2. Em `wrangler.jsonc`, adicione:

```json
{
  "routes": [
    {
      "pattern": "mcp.seudominio.com/*",
      "zone_name": "seudominio.com"
    }
  ]
}
```

3. Deploy:

```bash
npm run deploy
```

## Monitoramento

Acesse o dashboard do Cloudflare para ver:
- Métricas de requisições
- Erros
- Performance
- Uso de recursos

Dashboard: https://dash.cloudflare.com/

## Custos

Cloudflare Workers Free Tier:
- 100,000 requisições/dia
- 10ms CPU time por requisição

Para uso maior, veja os planos pagos em: https://workers.cloudflare.com/

## Próximos Passos

Após o deploy bem-sucedido:

1. Teste todos os endpoints
2. Conecte no Claude Desktop
3. Configure políticas de acesso
4. Monitore o uso
5. Configure alertas (opcional)

## Comandos Úteis

```bash
# Login
npx wrangler login

# Deploy
npm run deploy

# Ver logs
npx wrangler tail

# Desenvolvimento local
npm run dev

# Type check
npm run type-check

# Rollback
npx wrangler rollback

# Deletar worker
npx wrangler delete
```

## Suporte

- Documentação Wrangler: https://developers.cloudflare.com/workers/wrangler/
- Documentação Workers: https://developers.cloudflare.com/workers/
- GitHub Issues: https://github.com/myselfgus/remote-mcp-server-authless/issues
