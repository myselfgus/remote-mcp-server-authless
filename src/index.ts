import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Cloudflare Access JWT validation
interface CloudflareAccessConfig {
	teamDomain: string; // e.g., "voither.cloudflareaccess.com"
	audience: string; // Application Audience (AUD) tag
}

interface JWKKey {
	kid: string;
	kty: string;
	alg: string;
	use?: string;
	n: string;
	e: string;
}

interface JWKSResponse {
	keys: JWKKey[];
	public_cert?: { kid: string; cert: string };
	public_certs?: Array<{ kid: string; cert: string }>;
}

async function getJWKS(teamDomain: string): Promise<JWKKey[]> {
	const certsUrl = `https://${teamDomain}/cdn-cgi/access/certs`;
	const response = await fetch(certsUrl);

	if (!response.ok) {
		throw new Error(`Failed to fetch JWKS: ${response.status}`);
	}

	const jwks: JWKSResponse = await response.json();
	return jwks.keys;
}

function base64UrlDecode(str: string): Uint8Array {
	// Replace URL-safe characters and add padding
	str = str.replace(/-/g, "+").replace(/_/g, "/");
	while (str.length % 4) {
		str += "=";
	}

	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

async function verifyJWT(token: string, config: CloudflareAccessConfig): Promise<boolean> {
	try {
		// Parse JWT
		const parts = token.split(".");
		if (parts.length !== 3) {
			return false;
		}

		const [headerB64, payloadB64, signatureB64] = parts;

		// Decode header and payload
		const header = JSON.parse(new TextDecoder().decode(base64UrlDecode(headerB64)));
		const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));

		// Verify audience
		if (payload.aud !== config.audience && !payload.aud?.includes(config.audience)) {
			console.error("Invalid audience:", payload.aud);
			return false;
		}

		// Verify expiration
		if (payload.exp && payload.exp < Date.now() / 1000) {
			console.error("Token expired");
			return false;
		}

		// Get JWKs
		const keys = await getJWKS(config.teamDomain);

		// Find the key matching the token's kid
		const key = keys.find((k) => k.kid === header.kid);
		if (!key) {
			console.error("Key not found for kid:", header.kid);
			return false;
		}

		// Import the public key
		const cryptoKey = await crypto.subtle.importKey(
			"jwk",
			{
				kty: key.kty,
				n: key.n,
				e: key.e,
				alg: key.alg || "RS256",
				ext: true,
			},
			{
				name: "RSASSA-PKCS1-v1_5",
				hash: "SHA-256",
			},
			false,
			["verify"],
		);

		// Verify signature
		const signatureBytes = base64UrlDecode(signatureB64);
		const dataBytes = new TextEncoder().encode(`${headerB64}.${payloadB64}`);

		const isValid = await crypto.subtle.verify(
			"RSASSA-PKCS1-v1_5",
			cryptoKey,
			signatureBytes,
			dataBytes,
		);

		return isValid;
	} catch (error) {
		console.error("JWT verification error:", error);
		return false;
	}
}

async function validateCloudflareAccess(
	request: Request,
	config: CloudflareAccessConfig,
): Promise<Response | null> {
	// Get the JWT from the CF-Access-JWT-Assertion header
	const token = request.headers.get("CF-Access-JWT-Assertion");

	if (!token) {
		return new Response("Unauthorized: No CF-Access-JWT-Assertion header", {
			status: 401,
			headers: {
				"Content-Type": "text/plain",
			},
		});
	}

	// Verify the JWT
	const isValid = await verifyJWT(token, config);

	if (!isValid) {
		return new Response("Unauthorized: Invalid JWT token", {
			status: 401,
			headers: {
				"Content-Type": "text/plain",
			},
		});
	}

	// Token is valid, allow the request to proceed
	return null;
}

// Storage interface for MCP server configurations
interface MCPServerConfig {
	name: string;
	version: string;
	description: string;
	tools: ToolDefinition[];
	resources: ResourceDefinition[];
	prompts: PromptDefinition[];
	wranglerConfig: WranglerConfig;
	createdAt: number;
	updatedAt: number;
}

interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, any>;
	implementation: string;
}

interface ResourceDefinition {
	uri: string;
	name: string;
	description: string;
	mimeType: string;
	implementation: string;
}

interface PromptDefinition {
	name: string;
	description: string;
	arguments: Array<{ name: string; description: string; required: boolean }>;
	template: string;
}

interface WranglerConfig {
	name: string;
	compatibilityDate: string;
	compatibilityFlags: string[];
	routes?: string[];
	vars?: Record<string, any>;
}

// Define our Meta-MCP agent that creates other MCP servers
export class MetaMCP extends McpAgent {
	server = new McpServer({
		name: "MCP Remote Server Builder",
		version: "1.0.0",
	});

	// In-memory storage for server configurations (in production, use Durable Objects storage)
	private servers: Map<string, MCPServerConfig> = new Map();

	async init() {
		// Tool 1: Create a new MCP server
		this.server.tool(
			"create_mcp_server",
			{
				name: z.string().describe("Name of the MCP server (e.g., 'weather-server')"),
				version: z.string().default("1.0.0").describe("Version of the server"),
				description: z.string().describe("Description of what the MCP server does"),
			},
			async ({ name, version, description }) => {
				// Validate name format
				const nameRegex = /^[a-z0-9-]+$/;
				if (!nameRegex.test(name)) {
					return {
						content: [
							{
								type: "text",
								text: "Error: Server name must contain only lowercase letters, numbers, and hyphens",
							},
						],
					};
				}

				const serverId = name;

				if (this.servers.has(serverId)) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${name}' already exists. Use update tools to modify it.`,
							},
						],
					};
				}

				const config: MCPServerConfig = {
					name,
					version,
					description,
					tools: [],
					resources: [],
					prompts: [],
					wranglerConfig: {
						name,
						compatibilityDate: "2025-03-10",
						compatibilityFlags: ["nodejs_compat"],
					},
					createdAt: Date.now(),
					updatedAt: Date.now(),
				};

				this.servers.set(serverId, config);

				return {
					content: [
						{
							type: "text",
							text: `Successfully created MCP server '${name}'!\n\nNext steps:\n1. Add tools using add_mcp_tool\n2. Optionally add resources using add_mcp_resource\n3. Optionally add prompts using add_mcp_prompt\n4. Configure deployment using configure_wrangler\n5. Generate code using get_mcp_server_code\n6. Deploy using deploy_mcp_server`,
						},
					],
				};
			},
		);

		// Tool 2: Add a tool to an MCP server
		this.server.tool(
			"add_mcp_tool",
			{
				serverId: z.string().describe("ID of the MCP server (server name)"),
				toolName: z.string().describe("Name of the tool"),
				description: z.string().describe("Description of what the tool does"),
				parameters: z
					.record(z.any())
					.describe(
						"Tool parameters as JSON object with Zod schema definitions (e.g., {\"city\": {\"type\": \"string\", \"description\": \"City name\"}})",
					),
				implementation: z
					.string()
					.describe(
						"JavaScript implementation code that will be executed (receives parameters, returns {content: [{type: 'text', text: string}]})",
					),
			},
			async ({ serverId, toolName, description, parameters, implementation }) => {
				const config = this.servers.get(serverId);
				if (!config) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found. Create it first using create_mcp_server.`,
							},
						],
					};
				}

				// Check if tool already exists
				const existingIndex = config.tools.findIndex((t) => t.name === toolName);
				if (existingIndex >= 0) {
					config.tools[existingIndex] = {
						name: toolName,
						description,
						parameters,
						implementation,
					};
				} else {
					config.tools.push({
						name: toolName,
						description,
						parameters,
						implementation,
					});
				}

				config.updatedAt = Date.now();
				this.servers.set(serverId, config);

				return {
					content: [
						{
							type: "text",
							text: `Successfully ${existingIndex >= 0 ? "updated" : "added"} tool '${toolName}' to server '${serverId}'!\n\nTool: ${toolName}\nDescription: ${description}\nParameters: ${JSON.stringify(parameters, null, 2)}`,
						},
					],
				};
			},
		);

		// Tool 3: Add a resource to an MCP server
		this.server.tool(
			"add_mcp_resource",
			{
				serverId: z.string().describe("ID of the MCP server"),
				uri: z.string().describe("URI of the resource (e.g., 'file:///data/config.json')"),
				name: z.string().describe("Name of the resource"),
				description: z.string().describe("Description of the resource"),
				mimeType: z.string().default("text/plain").describe("MIME type of the resource"),
				implementation: z
					.string()
					.describe("JavaScript code to generate the resource content (returns string)"),
			},
			async ({ serverId, uri, name, description, mimeType, implementation }) => {
				const config = this.servers.get(serverId);
				if (!config) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found.`,
							},
						],
					};
				}

				const existingIndex = config.resources.findIndex((r) => r.uri === uri);
				if (existingIndex >= 0) {
					config.resources[existingIndex] = {
						uri,
						name,
						description,
						mimeType,
						implementation,
					};
				} else {
					config.resources.push({
						uri,
						name,
						description,
						mimeType,
						implementation,
					});
				}

				config.updatedAt = Date.now();
				this.servers.set(serverId, config);

				return {
					content: [
						{
							type: "text",
							text: `Successfully ${existingIndex >= 0 ? "updated" : "added"} resource '${name}' to server '${serverId}'!`,
						},
					],
				};
			},
		);

		// Tool 4: Add a prompt to an MCP server
		this.server.tool(
			"add_mcp_prompt",
			{
				serverId: z.string().describe("ID of the MCP server"),
				promptName: z.string().describe("Name of the prompt"),
				description: z.string().describe("Description of what the prompt does"),
				arguments: z
					.array(
						z.object({
							name: z.string(),
							description: z.string(),
							required: z.boolean(),
						}),
					)
					.default([])
					.describe("Array of prompt arguments"),
				template: z
					.string()
					.describe(
						"Prompt template with argument placeholders (e.g., 'Analyze {{code}} for security issues')",
					),
			},
			async ({ serverId, promptName, description, arguments: args, template }) => {
				const config = this.servers.get(serverId);
				if (!config) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found.`,
							},
						],
					};
				}

				const existingIndex = config.prompts.findIndex((p) => p.name === promptName);
				if (existingIndex >= 0) {
					config.prompts[existingIndex] = {
						name: promptName,
						description,
						arguments: args,
						template,
					};
				} else {
					config.prompts.push({
						name: promptName,
						description,
						arguments: args,
						template,
					});
				}

				config.updatedAt = Date.now();
				this.servers.set(serverId, config);

				return {
					content: [
						{
							type: "text",
							text: `Successfully ${existingIndex >= 0 ? "updated" : "added"} prompt '${promptName}' to server '${serverId}'!`,
						},
					],
				};
			},
		);

		// Tool 5: Configure Wrangler deployment settings
		this.server.tool(
			"configure_wrangler",
			{
				serverId: z.string().describe("ID of the MCP server"),
				routes: z.array(z.string()).optional().describe("Custom routes for the worker"),
				vars: z.record(z.any()).optional().describe("Environment variables"),
				compatibilityDate: z.string().optional().describe("Compatibility date"),
			},
			async ({ serverId, routes, vars, compatibilityDate }) => {
				const config = this.servers.get(serverId);
				if (!config) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found.`,
							},
						],
					};
				}

				if (routes) config.wranglerConfig.routes = routes;
				if (vars) config.wranglerConfig.vars = vars;
				if (compatibilityDate) config.wranglerConfig.compatibilityDate = compatibilityDate;

				config.updatedAt = Date.now();
				this.servers.set(serverId, config);

				return {
					content: [
						{
							type: "text",
							text: `Successfully updated Wrangler configuration for '${serverId}'!\n\n${JSON.stringify(config.wranglerConfig, null, 2)}`,
						},
					],
				};
			},
		);

		// Tool 6: Get generated MCP server code
		this.server.tool(
			"get_mcp_server_code",
			{
				serverId: z.string().describe("ID of the MCP server"),
				fileType: z
					.enum(["index", "wrangler", "package", "all"])
					.default("all")
					.describe("Which file to generate: index.ts, wrangler.jsonc, package.json, or all"),
			},
			async ({ serverId, fileType }) => {
				const config = this.servers.get(serverId);
				if (!config) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found.`,
							},
						],
					};
				}

				const files: Record<string, string> = {};

				// Generate index.ts
				if (fileType === "index" || fileType === "all") {
					files["src/index.ts"] = this.generateIndexTs(config);
				}

				// Generate wrangler.jsonc
				if (fileType === "wrangler" || fileType === "all") {
					files["wrangler.jsonc"] = this.generateWranglerConfig(config);
				}

				// Generate package.json
				if (fileType === "package" || fileType === "all") {
					files["package.json"] = this.generatePackageJson(config);
				}

				const output = Object.entries(files)
					.map(([filename, content]) => `\n### ${filename}\n\`\`\`${filename.endsWith(".ts") ? "typescript" : "json"}\n${content}\n\`\`\``)
					.join("\n");

				return {
					content: [
						{
							type: "text",
							text: `Generated code for MCP server '${serverId}':\n${output}\n\nYou can now:\n1. Save these files to a new project directory\n2. Run 'npm install'\n3. Run 'npm run deploy' to deploy to Cloudflare Workers`,
						},
					],
				};
			},
		);

		// Tool 7: List all created servers
		this.server.tool(
			"list_mcp_servers",
			{},
			async () => {
				if (this.servers.size === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No MCP servers created yet. Use create_mcp_server to create one.",
							},
						],
					};
				}

				const serverList = Array.from(this.servers.values())
					.map(
						(s) =>
							`- **${s.name}** (v${s.version})\n  ${s.description}\n  Tools: ${s.tools.length}, Resources: ${s.resources.length}, Prompts: ${s.prompts.length}\n  Updated: ${new Date(s.updatedAt).toLocaleString()}`,
					)
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: `MCP Servers (${this.servers.size}):\n\n${serverList}`,
						},
					],
				};
			},
		);

		// Tool 8: Delete an MCP server
		this.server.tool(
			"delete_mcp_server",
			{
				serverId: z.string().describe("ID of the MCP server to delete"),
			},
			async ({ serverId }) => {
				if (!this.servers.has(serverId)) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found.`,
							},
						],
					};
				}

				this.servers.delete(serverId);

				return {
					content: [
						{
							type: "text",
							text: `Successfully deleted MCP server '${serverId}'.`,
						},
					],
				};
			},
		);

		// Tool 9: Get server details
		this.server.tool(
			"get_mcp_server_details",
			{
				serverId: z.string().describe("ID of the MCP server"),
			},
			async ({ serverId }) => {
				const config = this.servers.get(serverId);
				if (!config) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found.`,
							},
						],
					};
				}

				const details = `
# MCP Server: ${config.name}

**Version:** ${config.version}
**Description:** ${config.description}
**Created:** ${new Date(config.createdAt).toLocaleString()}
**Updated:** ${new Date(config.updatedAt).toLocaleString()}

## Tools (${config.tools.length})
${config.tools.map((t) => `- **${t.name}**: ${t.description}`).join("\n") || "None"}

## Resources (${config.resources.length})
${config.resources.map((r) => `- **${r.name}** (${r.uri}): ${r.description}`).join("\n") || "None"}

## Prompts (${config.prompts.length})
${config.prompts.map((p) => `- **${p.name}**: ${p.description}`).join("\n") || "None"}

## Wrangler Config
\`\`\`json
${JSON.stringify(config.wranglerConfig, null, 2)}
\`\`\`
				`.trim();

				return {
					content: [
						{
							type: "text",
							text: details,
						},
					],
				};
			},
		);

		// Tool 10: Generate deployment command
		this.server.tool(
			"get_deployment_instructions",
			{
				serverId: z.string().describe("ID of the MCP server"),
			},
			async ({ serverId }) => {
				const config = this.servers.get(serverId);
				if (!config) {
					return {
						content: [
							{
								type: "text",
								text: `Error: Server '${serverId}' not found.`,
							},
						],
					};
				}

				const instructions = `
# Deployment Instructions for ${config.name}

## Step 1: Create Project Directory
\`\`\`bash
mkdir ${config.name}
cd ${config.name}
\`\`\`

## Step 2: Get Generated Code
Use the \`get_mcp_server_code\` tool with serverId="${serverId}" and fileType="all" to get all files.

## Step 3: Save Files
Save the generated files to your project:
- src/index.ts
- wrangler.jsonc
- package.json
- tsconfig.json (use the same from this project)

## Step 4: Install Dependencies
\`\`\`bash
npm install
\`\`\`

## Step 5: Test Locally
\`\`\`bash
npm run dev
\`\`\`

Visit http://localhost:8787/sse to test your MCP server locally.

## Step 6: Deploy to Cloudflare Workers
\`\`\`bash
npm run deploy
\`\`\`

Your MCP server will be deployed to:
\`${config.name}.<your-account>.workers.dev/sse\`

## Step 7: Connect to Claude Desktop
Add to your Claude Desktop config (~/.config/claude/claude_desktop_config.json):

\`\`\`json
{
  "mcpServers": {
    "${config.name}": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://${config.name}.<your-account>.workers.dev/sse"
      ]
    }
  }
}
\`\`\`

Restart Claude Desktop and your tools will be available!
				`.trim();

				return {
					content: [
						{
							type: "text",
							text: instructions,
						},
					],
				};
			},
		);
	}

	// Helper method to generate index.ts
	private generateIndexTs(config: MCPServerConfig): string {
		const toolImplementations = config.tools
			.map((tool) => {
				const zodParams = Object.entries(tool.parameters)
					.map(([key, value]: [string, any]) => {
						let zodType = "z.string()";
						if (value.type === "number") zodType = "z.number()";
						if (value.type === "boolean") zodType = "z.boolean()";
						if (value.type === "array") zodType = "z.array(z.any())";
						if (value.type === "object") zodType = "z.record(z.any())";

						if (value.description) {
							zodType += `.describe("${value.description}")`;
						}
						if (value.optional) {
							zodType += ".optional()";
						}
						if (value.default !== undefined) {
							zodType += `.default(${JSON.stringify(value.default)})`;
						}

						return `${key}: ${zodType}`;
					})
					.join(",\n\t\t\t");

				return `
		// ${tool.description}
		this.server.tool(
			"${tool.name}",
			{
				${zodParams}
			},
			async (params) => {
				try {
					${tool.implementation}
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: \`Error: \${error instanceof Error ? error.message : String(error)}\`
						}]
					};
				}
			}
		);`;
			})
			.join("\n");

		const resourceImplementations = config.resources
			.map((resource) => {
				return `
		// Resource: ${resource.name}
		this.server.resource(
			"${resource.uri}",
			{
				name: "${resource.name}",
				description: "${resource.description}",
				mimeType: "${resource.mimeType}"
			},
			async () => {
				try {
					${resource.implementation}
				} catch (error) {
					return {
						contents: [{
							uri: "${resource.uri}",
							mimeType: "text/plain",
							text: \`Error: \${error instanceof Error ? error.message : String(error)}\`
						}]
					};
				}
			}
		);`;
			})
			.join("\n");

		const promptImplementations = config.prompts
			.map((prompt) => {
				const promptArgs = prompt.arguments
					.map(
						(arg) =>
							`{
					name: "${arg.name}",
					description: "${arg.description}",
					required: ${arg.required}
				}`,
					)
					.join(",\n\t\t\t");

				return `
		// Prompt: ${prompt.name}
		this.server.prompt(
			"${prompt.name}",
			{
				description: "${prompt.description}",
				arguments: [
					${promptArgs}
				]
			},
			async (args) => {
				let template = \`${prompt.template}\`;
				for (const [key, value] of Object.entries(args)) {
					template = template.replace(new RegExp(\`{{\\\\s*\${key}\\\\s*}}\`, 'g'), String(value));
				}
				return {
					messages: [{
						role: "user",
						content: { type: "text", text: template }
					}]
				};
			}
		);`;
			})
			.join("\n");

		return `import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ${config.description}
export class ${this.toPascalCase(config.name)} extends McpAgent {
	server = new McpServer({
		name: "${config.name}",
		version: "${config.version}",
	});

	async init() {${toolImplementations}${resourceImplementations}${promptImplementations}
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		const url = new URL(request.url);

		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return ${this.toPascalCase(config.name)}.serveSSE("/sse").fetch(request, env, ctx);
		}

		if (url.pathname === "/mcp") {
			return ${this.toPascalCase(config.name)}.serve("/mcp").fetch(request, env, ctx);
		}

		return new Response("Not found", { status: 404 });
	},
};
`;
	}

	// Helper method to generate wrangler.jsonc
	private generateWranglerConfig(config: MCPServerConfig): string {
		const className = this.toPascalCase(config.name);
		const wranglerConfig = {
			$schema: "node_modules/wrangler/config-schema.json",
			name: config.wranglerConfig.name,
			main: "src/index.ts",
			compatibility_date: config.wranglerConfig.compatibilityDate,
			compatibility_flags: config.wranglerConfig.compatibilityFlags,
			...(config.wranglerConfig.routes && { routes: config.wranglerConfig.routes }),
			...(config.wranglerConfig.vars && { vars: config.wranglerConfig.vars }),
			migrations: [
				{
					new_sqlite_classes: [className],
					tag: "v1",
				},
			],
			durable_objects: {
				bindings: [
					{
						class_name: className,
						name: "MCP_OBJECT",
					},
				],
			},
			observability: {
				enabled: true,
			},
		};

		return JSON.stringify(wranglerConfig, null, "\t");
	}

	// Helper method to generate package.json
	private generatePackageJson(config: MCPServerConfig): string {
		const packageJson = {
			name: config.name,
			version: config.version,
			description: config.description,
			private: true,
			scripts: {
				deploy: "wrangler deploy",
				dev: "wrangler dev",
				format: "biome format --write",
				"lint:fix": "biome lint --fix",
				start: "wrangler dev",
				"cf-typegen": "wrangler types",
				"type-check": "tsc --noEmit",
			},
			dependencies: {
				"@modelcontextprotocol/sdk": "1.17.3",
				agents: "^0.0.113",
				zod: "^3.25.76",
			},
			devDependencies: {
				"@biomejs/biome": "^2.2.2",
				typescript: "5.9.2",
				wrangler: "^4.33.1",
			},
		};

		return JSON.stringify(packageJson, null, 2);
	}

	// Helper to convert kebab-case to PascalCase
	private toPascalCase(str: string): string {
		return str
			.split("-")
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
			.join("");
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext) {
		// CORS headers for all responses
		const corsHeaders = {
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type, Authorization, CF-Access-JWT-Assertion",
			"Access-Control-Max-Age": "86400",
		};

		try {
			const url = new URL(request.url);

			// Handle OPTIONS preflight requests
			if (request.method === "OPTIONS") {
				return new Response(null, {
					status: 204,
					headers: corsHeaders,
				});
			}

			// Health check endpoint (no auth required)
			if (url.pathname === "/health" || url.pathname === "/ping") {
				return new Response(
					JSON.stringify({
						status: "ok",
						server: "MCP Remote Server Builder",
						version: "1.0.0",
						timestamp: new Date().toISOString(),
					}),
					{
						status: 200,
						headers: {
							"Content-Type": "application/json",
							...corsHeaders,
						},
					},
				);
			}

			// Root endpoint with server info (no auth required)
			if (url.pathname === "/") {
				return new Response(
					JSON.stringify(
						{
							name: "MCP Remote Server Builder",
							version: "1.0.0",
							description:
								"Meta-MCP Server for creating and deploying MCP Remote Servers",
							endpoints: {
								sse: "/sse (Server-Sent Events transport)",
								mcp: "/mcp (HTTP POST transport)",
								health: "/health (Health check)",
								message: "/sse/message (SSE message endpoint)",
							},
							documentation: "https://github.com/myselfgus/remote-mcp-server-authless",
							authentication: env.CF_ACCESS_ENABLED !== "false" ? "enabled" : "disabled",
							usage: {
								claude_desktop:
									'Add to config: { "command": "npx", "args": ["mcp-remote", "URL/sse"] }',
								direct_connection: "Connect to /sse endpoint for Server-Sent Events",
							},
						},
						null,
						2,
					),
					{
						status: 200,
						headers: {
							"Content-Type": "application/json",
							...corsHeaders,
						},
					},
				);
			}

			// Cloudflare Access configuration
			const accessConfig: CloudflareAccessConfig = {
				teamDomain: env.CF_ACCESS_TEAM_DOMAIN || "voither.cloudflareaccess.com",
				audience:
					env.CF_ACCESS_AUDIENCE ||
					"0f2923c24cec6a2ee1f63570394014228d05e00dab403548f82c65eb9c7a63f3",
			};

			// Enable/disable authentication
			const authEnabled = env.CF_ACCESS_ENABLED !== "false"; // Default to enabled

			// Validate Cloudflare Access JWT if enabled (skip for health/root endpoints)
			if (authEnabled) {
				try {
					const authError = await validateCloudflareAccess(request, accessConfig);
					if (authError) {
						return authError;
					}
				} catch (authErr) {
					console.error("Auth validation error:", authErr);
					// Continue without auth if validation fails
				}
			}

			// Process MCP requests with CORS
			if (url.pathname === "/sse" || url.pathname === "/sse/message") {
				const response = await MetaMCP.serveSSE("/sse").fetch(request, env, ctx);
				// Add CORS headers to SSE response
				const newHeaders = new Headers(response.headers);
				Object.entries(corsHeaders).forEach(([key, value]) => {
					newHeaders.set(key, value);
				});
				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: newHeaders,
				});
			}

			if (url.pathname === "/mcp") {
				const response = await MetaMCP.serve("/mcp").fetch(request, env, ctx);
				// Add CORS headers to MCP response
				const newHeaders = new Headers(response.headers);
				Object.entries(corsHeaders).forEach(([key, value]) => {
					newHeaders.set(key, value);
				});
				return new Response(response.body, {
					status: response.status,
					statusText: response.statusText,
					headers: newHeaders,
				});
			}

			return new Response("Not found", {
				status: 404,
				headers: {
					"Content-Type": "text/plain",
					...corsHeaders,
				},
			});
		} catch (error) {
			console.error("Worker error:", error);
			return new Response(
				JSON.stringify({
					error: "Internal server error",
					message: error instanceof Error ? error.message : String(error),
					timestamp: new Date().toISOString(),
				}),
				{
					status: 500,
					headers: {
						"Content-Type": "application/json",
						...corsHeaders,
					},
				},
			);
		}
	},
};
