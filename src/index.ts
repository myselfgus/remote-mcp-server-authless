import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Connection } from "partyserver";
import { z } from "zod";
import { nanoid } from "nanoid";

// Export RPC class for service bindings
export { MetaMCPRPC } from "./rpc";

// Cloudflare Access authentication
// NOTE: When Cloudflare Access is configured in the dashboard, it intercepts ALL requests
// BEFORE they reach the Worker and handles authentication/authorization.
// The Worker does NOT need to validate JWT - if the request reaches the Worker,
// it means Cloudflare Access already validated it.
//
// This flag just tracks whether we EXPECT Cloudflare Access to be enabled in the dashboard.
interface CloudflareAccessConfig {
	enabled: boolean;
}

async function validateCloudflareAccess(
	request: Request,
	config: CloudflareAccessConfig,
): Promise<Response | null> {
	// If Cloudflare Access is enabled in the dashboard, it handles everything.
	// The Worker doesn't need to do any validation - just let requests through.
	// Cloudflare Access validates JWT, checks policies, and blocks unauthorized requests
	// BEFORE they reach this code.
	return null; // Always allow - Cloudflare Access in dashboard handles security
}

// Storage interface for MCP server configurations
interface Env {
	DB: D1Database;
	KV: KVNamespace;
	STORAGE: R2Bucket;
	DISPATCHER: any;
	WORKER_PUBLISHER: any;
	CONTAINER_MANAGER: any;
	MCP_CLIENT: any;
	CF_ACCESS_ENABLED?: string;
}

interface MCPServerConfig {
	id?: string;
	name: string;
	version: string;
	description: string;
	tools: ToolDefinition[];
	resources: ResourceDefinition[];
	prompts: PromptDefinition[];
	wranglerConfig: WranglerConfig;
	createdAt: number;
	updatedAt: number;
	status?: 'draft' | 'creating' | 'building' | 'deploying' | 'active' | 'failed' | 'stopped';
	worker_name?: string;
	container_id?: string;
	metadata?: Record<string, any>;
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

// Database schema types for SQLite persistence
interface DatabaseSchema {
	mcp_servers: {
		id: string;
		name: string;
		version: string;
		description: string;
		created_at: number;
		updated_at: number;
		wrangler_config: string; // JSON
	};
	mcp_tools: {
		id: number;
		server_id: string;
		name: string;
		description: string;
		parameters: string; // JSON
		implementation: string;
		created_at: number;
	};
	mcp_resources: {
		id: number;
		server_id: string;
		uri: string;
		name: string;
		description: string;
		mime_type: string;
		implementation: string;
		created_at: number;
	};
	mcp_prompts: {
		id: number;
		server_id: string;
		name: string;
		description: string;
		arguments: string; // JSON
		template: string;
		created_at: number;
	};
	cleanup_requests: {
		id: string;
		requested_at: number;
		servers_to_delete: string; // JSON array
		status: "pending" | "approved" | "rejected";
		responded_at: number | null;
	};
	mcp_client_connections: {
		id: string;
		name: string;
		url: string;
		status: "connected" | "disconnected" | "error";
		last_sync: number;
		capabilities: string | null; // JSON
		tools_count: number;
		resources_count: number;
		created_at: number;
	};
}

// State management interface
interface MetaMCPState {
	// Server statistics
	totalServers: number;
	totalTools: number;
	totalResources: number;
	totalPrompts: number;

	// Recent activity
	lastServerCreated: {
		name: string;
		timestamp: number;
	} | null;
	lastServerUpdated: {
		name: string;
		timestamp: number;
	} | null;
	lastServerDeleted: {
		name: string;
		timestamp: number;
	} | null;

	// Cleanup state
	pendingCleanupRequests: number;
	lastCleanupRun: number | null;
	nextScheduledCleanup: number | null;

	// MCP client connections
	connectedMCPServers: Array<{
		name: string;
		url: string;
		status: "connected" | "disconnected" | "error";
		lastSync: number;
	}>;

	// System health
	databaseHealth: "healthy" | "degraded" | "error";
	lastHealthCheck: number;
}

// Cleanup configuration
interface CleanupConfig {
	enabled: boolean;
	daysThreshold: number;
	checkIntervalMs: number;
	requireConfirmation: boolean;
	confirmationTimeoutMs: number;
}

const DEFAULT_CLEANUP_CONFIG: CleanupConfig = {
	enabled: true,
	daysThreshold: 30,
	checkIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
	requireConfirmation: true,
	confirmationTimeoutMs: 48 * 60 * 60 * 1000, // 48 hours
};

// Define our Meta-MCP agent that creates other MCP servers
export class MetaMCP extends McpAgent<Env, MetaMCPState> {
	server = new McpServer({
		name: "MCP Remote Server Builder",
		version: "1.0.0",
	});

	// Initialize state
	initialState: MetaMCPState = {
		totalServers: 0,
		totalTools: 0,
		totalResources: 0,
		totalPrompts: 0,
		lastServerCreated: null,
		lastServerUpdated: null,
		lastServerDeleted: null,
		pendingCleanupRequests: 0,
		lastCleanupRun: null,
		nextScheduledCleanup: null,
		connectedMCPServers: [],
		databaseHealth: "healthy",
		lastHealthCheck: Date.now(),
	};

	private isDbInitialized = false;

	async init() {
		// Initialize database first
		await this.initializeDatabase();

		// Initialize cleanup scheduling
		const config = await this.ctx.storage.get<CleanupConfig>("cleanup_config");
		if (!config) {
			await this.ctx.storage.put("cleanup_config", DEFAULT_CLEANUP_CONFIG);
		}

		// Tool 1: Initialize MCP server with container template
		this.server.tool(
			"init_mcp_server",
			{
				name: z.string().describe("Name of the MCP server (e.g., 'weather-server')"),
				version: z.string().default("1.0.0").describe("Version of the server"),
				description: z.string().describe("Description of what the MCP server does"),
			},
			async ({ name, version, description }) => {
				try {
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

					const existingServer = await this.getServerFromDB(serverId);
					if (existingServer !== null) {
						return {
							content: [
								{
									type: "text",
									text: `Error: Server '${name}' already exists. Use update tools to modify it.`,
								},
							],
						};
					}

					// Create initial config
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
						status: 'creating',
						createdAt: Date.now(),
						updatedAt: Date.now(),
					};

					// Save to D1
					await this.saveServerToDB(serverId, config);

					// Initialize container via CONTAINER_MANAGER RPC
					const containerResult = await this.env.CONTAINER_MANAGER.createSDKEnvironment(
						serverId,
						['@modelcontextprotocol/sdk', 'agents', 'zod']
					);

					if (!containerResult.success) {
						// Update status to failed
						config.status = 'failed';
						config.metadata = { error: containerResult.error };
						await this.saveServerToDB(serverId, config);

						return {
							content: [
								{
									type: "text",
									text: `Error: Failed to create SDK environment in container: ${containerResult.error}`,
								},
							],
						};
					}

					// Update config with container info and set to draft (ready for tools)
					config.status = 'draft';
					config.container_id = containerResult.containerId;
					config.metadata = {
						containerCreated: Date.now(),
						workspacePath: containerResult.workspacePath,
						template: containerResult.template,
						packagesInstalled: containerResult.sdks
					};
					await this.saveServerToDB(serverId, config);
					await this.notifyServerCreated(name);

					return {
						content: [
							{
								type: "text",
								text: `Successfully created MCP server '${name}'!\n\n✅ Container ID: ${containerResult.containerId}\n✅ Workspace: ${containerResult.workspacePath}\n✅ Template: ${containerResult.template}\n✅ Base structure ready with McpAgent and Durable Object bindings\n\nNext steps:\n1. Add tools using add_mcp_tool\n2. Optionally add resources using add_mcp_resource\n3. Optionally add prompts using add_mcp_prompt\n4. Deploy using wrangler_deploy`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error creating MCP server: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
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
				try {
					const config = await this.getServerFromDB(serverId);
					if (!config) {
						return {
							content: [
								{
									type: "text",
									text: `Error: Server '${serverId}' not found. Create it first using init_mcp_server.`,
								},
							],
						};
					}

					if (!config.container_id) {
						return {
							content: [
								{
									type: "text",
									text: `Error: Server '${serverId}' has no container. Something went wrong during initialization.`,
								},
							],
						};
					}

					// Generate Zod schema code for parameters
					const zodParams = Object.entries(parameters)
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

					// Generate tool code
					const toolCode = `// ${description}
		this.server.tool(
			"${toolName}",
			{
				${zodParams}
			},
			async (params) => {
				try {
					${implementation}
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

					// Add tool to container via CONTAINER_MANAGER RPC
					const addResult = await this.env.CONTAINER_MANAGER.addToolToServer(
						config.container_id,
						serverId,
						toolName,
						toolCode
					);

					if (!addResult.success) {
						return {
							content: [
								{
									type: "text",
									text: `Error adding tool to container: ${addResult.error}`,
								},
							],
						};
					}

					// Update D1 for tracking
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
					await this.saveServerToDB(serverId, config);
					await this.notifyServerUpdated(config.name);

					return {
						content: [
							{
								type: "text",
								text: `✅ Successfully ${existingIndex >= 0 ? "updated" : "added"} tool '${toolName}' to server '${serverId}'!\n\n📝 Tool added to container: ${addResult.message}\n\nTool: ${toolName}\nDescription: ${description}\nParameters: ${JSON.stringify(parameters, null, 2)}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
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
				try {
					const config = await this.getServerFromDB(serverId);
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

					if (!config.container_id) {
						return {
							content: [
								{
									type: "text",
									text: `Error: Server '${serverId}' has no container.`,
								},
							],
						};
					}

					// Generate resource code
					const resourceCode = `// ${description}
		this.server.resource(
			"${uri}",
			async () => {
				try {
					const content = ${implementation};
					return {
						contents: [{
							uri: "${uri}",
							name: "${name}",
							mimeType: "${mimeType}",
							text: content
						}]
					};
				} catch (error) {
					throw new Error(\`Failed to generate resource: \${error instanceof Error ? error.message : String(error)}\`);
				}
			}
		);`;

					// Add resource to container via CONTAINER_MANAGER RPC
					const addResult = await this.env.CONTAINER_MANAGER.addResourceToServer(
						config.container_id,
						serverId,
						resourceCode
					);

					if (!addResult.success) {
						return {
							content: [
								{
									type: "text",
									text: `Error adding resource to container: ${addResult.error}`,
								},
							],
						};
					}

					// Update D1 for tracking
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
					await this.saveServerToDB(serverId, config);
					await this.notifyServerUpdated(config.name);

					return {
						content: [
							{
								type: "text",
								text: `✅ Successfully ${existingIndex >= 0 ? "updated" : "added"} resource '${name}' to server '${serverId}'!\n\n📝 Resource added to container: ${addResult.message}\n\nURI: ${uri}\nName: ${name}\nMIME Type: ${mimeType}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
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
				try {
					const config = await this.getServerFromDB(serverId);
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

					if (!config.container_id) {
						return {
							content: [
								{
									type: "text",
									text: `Error: Server '${serverId}' has no container.`,
								},
							],
						};
					}

					// Generate prompt arguments definition
					const argsDefinition = args.length > 0
						? args.map(arg => `{
							name: "${arg.name}",
							description: "${arg.description}",
							required: ${arg.required}
						}`).join(',\n\t\t\t')
						: '';

					// Generate prompt code
					const promptCode = `// ${description}
		this.server.prompt(
			"${promptName}",
			${argsDefinition ? `[${argsDefinition}]` : '[]'},
			async (args) => {
				try {
					// Replace template placeholders with argument values
					let result = \`${template}\`;
					${args.map(arg => `if (args.${arg.name}) result = result.replace(/\\{\\{${arg.name}\\}\\}/g, args.${arg.name});`).join('\n\t\t\t\t\t')}

					return {
						messages: [{
							role: "user",
							content: { type: "text", text: result }
						}]
					};
				} catch (error) {
					throw new Error(\`Failed to generate prompt: \${error instanceof Error ? error.message : String(error)}\`);
				}
			}
		);`;

					// Add prompt to container via CONTAINER_MANAGER RPC
					const addResult = await this.env.CONTAINER_MANAGER.addPromptToServer(
						config.container_id,
						serverId,
						promptCode
					);

					if (!addResult.success) {
						return {
							content: [
								{
									type: "text",
									text: `Error adding prompt to container: ${addResult.error}`,
								},
							],
						};
					}

					// Update D1 for tracking
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
					await this.saveServerToDB(serverId, config);
					await this.notifyServerUpdated(config.name);

					return {
						content: [
							{
								type: "text",
								text: `✅ Successfully ${existingIndex >= 0 ? "updated" : "added"} prompt '${promptName}' to server '${serverId}'!\n\n📝 Prompt added to container: ${addResult.message}\n\nPrompt: ${promptName}\nDescription: ${description}\nArguments: ${args.length}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
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
				const config = await this.getServerFromDB(serverId);
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
				await this.saveServerToDB(serverId, config);
				await this.notifyServerUpdated(config.name);

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
				const config = await this.getServerFromDB(serverId);
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
				const servers = await this.listServersFromDB();

				if (servers.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No MCP servers created yet. Use create_mcp_server to create one.",
							},
						],
					};
				}

				const serverList = servers
					.map(
						(s) =>
							`- **${s.name}** (v${s.version}) - Status: ${s.status || 'draft'}\n  ${s.description}\n  Tools: ${s.tools.length}, Resources: ${s.resources.length}, Prompts: ${s.prompts.length}\n  Worker: ${s.worker_name || 'Not deployed'}\n  Updated: ${new Date(s.updatedAt).toLocaleString()}`,
					)
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: `MCP Servers (${servers.length}):\n\n${serverList}`,
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
				const config = await this.getServerFromDB(serverId);
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

				// Se está deployed (status active), parar o worker
				if (config.status === 'active' && config.worker_name) {
					try {
						// Update status to stopped
						await this.env.DB.prepare(`
							UPDATE mcp_servers SET status = 'stopped', updated_at = ? WHERE id = ?
						`).bind(Date.now(), serverId).run();

						// Delete deployment from namespace
						const deployment = await this.env.DB.prepare(`
							SELECT * FROM worker_deployments WHERE worker_name = ?
						`).bind(config.worker_name).first() as any;

						if (deployment) {
							await this.env.WORKER_PUBLISHER.deleteDeployment(deployment.id);
						}
					} catch (error) {
						console.warn(`Failed to stop worker for ${serverId}:`, error);
						// Continua mesmo assim para deletar do D1 local
					}
				}

				// Deletar do D1 local
				const deleted = await this.deleteServerFromDB(serverId);
				if (deleted) {
					await this.notifyServerDeleted(config.name);
				}

				return {
					content: [
						{
							type: "text",
							text: `Successfully deleted MCP server '${serverId}'${config.status === 'active' ? ' and stopped its deployment' : ''}.`,
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
				const config = await this.getServerFromDB(serverId);
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
**Status:** ${config.status || 'draft'}
**Worker Name:** ${config.worker_name || 'Not deployed'}
**Container ID:** ${config.container_id || 'N/A'}
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
${config.metadata ? `\n## Metadata\n\`\`\`json\n${JSON.stringify(config.metadata, null, 2)}\n\`\`\`` : ''}
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

		// Tool 10: Generate deployment instructions
		this.server.tool(
			"get_deployment_instructions",
			{
				serverId: z.string().describe("ID of the MCP server"),
			},
			async ({ serverId }) => {
				const config = await this.getServerFromDB(serverId);
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

				// Buscar deployment info real do D1 (se existir)
				let deploymentUrl = 'Not deployed yet';
				let deploymentStatus: string = config.status || 'draft';

				if (config.worker_name) {
					const deployment = await this.env.DB.prepare(`
						SELECT deployment_url, status FROM worker_deployments
						WHERE worker_name = ?
						ORDER BY deployed_at DESC
						LIMIT 1
					`).bind(config.worker_name).first();

					if (deployment) {
						deploymentUrl = (deployment.deployment_url as string) || `https://${config.worker_name}.meta-mcp.workers.dev`;
						deploymentStatus = (deployment.status as string) || deploymentStatus;
					}
				}

				const instructions = `# Connection Instructions for ${config.name}

## Server Status
- Server ID: ${serverId}
- Deployment URL: ${deploymentUrl}
- Status: ${deploymentStatus}

## Connect to Claude Desktop

Add this to your Claude Desktop config (~/.config/claude/claude_desktop_config.json):

{
  "mcpServers": {
    "${config.name}": {
      "command": "npx",
      "args": ["mcp-remote", "${deploymentUrl}/sse"]
    }
  }
}

## Tools Available
${config.tools.map((t: any) => `- ${t.name}: ${t.description}`).join('\n') || 'No tools yet'}

## Next Steps
${deploymentStatus === 'active' ?
	'1. Use connect_external_mcp to test the connection\n2. Use call_mcp_tool to invoke tools' :
	'1. Deploy the server using wrangler_deploy\n2. Check status with get_mcp_server_details'
}`.trim();

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

		// Tool 11: Cleanup old servers with user confirmation
		this.server.tool(
			"cleanup_old_servers",
			{
				daysThreshold: z.number().default(30).describe("Delete servers older than this many days"),
				dryRun: z.boolean().default(false).describe("Preview what would be deleted without actually deleting"),
			},
			async ({ daysThreshold, dryRun }) => {
				const servers = await this.listServersFromDB();
				const now = Date.now();
				const threshold = daysThreshold * 24 * 60 * 60 * 1000;

				const oldServers = servers.filter((s) => now - s.updatedAt > threshold);

				if (oldServers.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: `No servers found older than ${daysThreshold} days.`,
							},
						],
					};
				}

				const serverList = oldServers
					.map(
						(s) =>
							`- ${s.name} (last updated: ${new Date(s.updatedAt).toLocaleString()}, ${Math.floor((now - s.updatedAt) / (24 * 60 * 60 * 1000))} days ago)`,
					)
					.join("\n");

				if (dryRun) {
					return {
						content: [
							{
								type: "text",
								text: `[DRY RUN] Found ${oldServers.length} servers older than ${daysThreshold} days:\n\n${serverList}\n\nRun without dryRun=true to proceed with deletion after confirmation.`,
							},
						],
					};
				}

				// Use elicitInput to ask user for confirmation
				try {
					const result = await this.elicitInput({
						message: `Found ${oldServers.length} servers older than ${daysThreshold} days:\n\n${serverList}\n\nDo you want to delete these servers? This action cannot be undone.`,
						requestedSchema: {
							type: "object",
							properties: {
								confirm: {
									type: "boolean",
									description: "Set to true to confirm deletion",
								},
							},
							required: ["confirm"],
						},
					});

					const confirmed = (result.content as { confirm: boolean }).confirm;

					if (!confirmed) {
						return {
							content: [
								{
									type: "text",
									text: "Cleanup cancelled by user.",
								},
							],
						};
					}

					// Delete confirmed servers
					let deletedCount = 0;
					for (const server of oldServers) {
						// Se está deployed, parar worker
						if (server.status === 'active' && server.worker_name) {
							try {
								// Update status to stopped
								await this.env.DB.prepare(`
									UPDATE mcp_servers SET status = 'stopped', updated_at = ? WHERE id = ?
								`).bind(Date.now(), server.id).run();

								// Delete deployment from namespace
								const deployment = await this.env.DB.prepare(`
									SELECT * FROM worker_deployments WHERE worker_name = ?
								`).bind(server.worker_name).first() as any;

								if (deployment) {
									await this.env.WORKER_PUBLISHER.deleteDeployment(deployment.id);
								}
							} catch (error) {
								console.warn(`Failed to stop worker for ${server.name}:`, error);
							}
						}

						// Deletar do D1 (usa server.id se existir, senão usa server.name)
						const deleted = await this.deleteServerFromDB(server.id || server.name);
						if (deleted) {
							await this.notifyServerDeleted(server.name);
							deletedCount++;
						}
					}

					// Update cleanup tracking
					await this.setState({
						...this.state,
						lastCleanupRun: Date.now(),
					});

					return {
						content: [
							{
								type: "text",
								text: `Successfully deleted ${deletedCount} old servers:\n\n${serverList}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error during cleanup: ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);

		// Tool 12: Connect to an MCP server
		this.server.tool(
			"connect_to_mcp_server",
			{
				name: z.string().describe("Friendly name for this connection"),
				url: z.string().describe("URL of the MCP server to connect to"),
				transport: z
					.enum(["streamable-http", "sse", "auto"])
					.default("auto")
					.describe("Transport type to use (auto will detect the best option)"),
			},
			async ({ name, url, transport }) => {
				try {
					// Connect using MCPClientManager
					await this.mcp.connect(url, {
						transport: { type: transport },
					});

					// Store connection in database com AWAIT
					await this.env.DB.prepare(`
						INSERT INTO mcp_client_connections (id, name, url, status, last_sync, created_at)
						VALUES (?, ?, ?, ?, ?, ?)
						ON CONFLICT(name) DO UPDATE SET
							url = excluded.url,
							status = excluded.status,
							last_sync = excluded.last_sync
					`).bind(
						`conn_${Date.now()}`,
						name,
						url,
						'connected',
						Date.now(),
						Date.now()
					).run();

					// Update state
					const connections = this.state.connectedMCPServers || [];
					const existing = connections.findIndex((c) => c.name === name);
					if (existing >= 0) {
						connections[existing] = { name, url, status: "connected", lastSync: Date.now() };
					} else {
						connections.push({ name, url, status: "connected", lastSync: Date.now() });
					}

					await this.setState({
						...this.state,
						connectedMCPServers: connections,
					});

					return {
						content: [
							{
								type: "text",
								text: `Successfully connected to MCP server '${name}' at ${url} using ${transport} transport.`,
							},
						],
					};
				} catch (error) {
					// Update connection status to error com AWAIT
					await this.env.DB.prepare(`
						UPDATE mcp_client_connections
						SET status = ?, last_sync = ?
						WHERE name = ?
					`).bind('error', Date.now(), name).run();

					return {
						content: [
							{
								type: "text",
								text: `Error connecting to MCP server '${name}': ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);

		// Tool 13: List connected MCP servers
		this.server.tool(
			"list_connected_mcp_servers",
			{},
			async () => {
				// Query com AWAIT
				const result = await this.env.DB.prepare(`
					SELECT * FROM mcp_client_connections
					ORDER BY created_at DESC
				`).all();

				const connections = result.results || [];

				if (connections.length === 0) {
					return {
						content: [
							{
								type: "text",
								text: "No MCP servers connected yet. Use connect_to_mcp_server to connect to an MCP server.",
							},
						],
					};
				}

				const connectionList = connections
					.map(
						(c: any) =>
							`- **${c.name}**\n  URL: ${c.url}\n  Status: ${c.status}\n  Last sync: ${new Date(c.last_sync).toLocaleString()}\n  Connected: ${new Date(c.created_at).toLocaleString()}`,
					)
					.join("\n\n");

				return {
					content: [
						{
							type: "text",
							text: `Connected MCP Servers (${connections.length}):\n\n${connectionList}`,
						},
					],
				};
			},
		);

		// Tool 14: Call a tool on a connected MCP server
		this.server.tool(
			"call_mcp_tool",
			{
				serverName: z.string().describe("Name of the connected MCP server"),
				toolName: z.string().describe("Name of the tool to call"),
				arguments: z.record(z.any()).default({}).describe("Arguments to pass to the tool"),
			},
			async ({ serverName, toolName, arguments: args }) => {
				try {
					// Get connection info com AWAIT
					const result = await this.env.DB.prepare(`
						SELECT * FROM mcp_client_connections
						WHERE name = ?
						LIMIT 1
					`).bind(serverName).first();

					if (!result) {
						return {
							content: [
								{
									type: "text",
									text: `Error: No connection found with name '${serverName}'. Use connect_to_mcp_server first.`,
								},
							],
						};
					}

					if (result.status !== "connected") {
						return {
							content: [
								{
									type: "text",
									text: `Error: Connection '${serverName}' is not active (status: ${result.status}). Try reconnecting.`,
								},
							],
						};
					}

					// Call the tool using MCPClientManager
					const toolResult = await this.mcp.callTool({
						serverId: result.url as string,
						name: toolName,
						arguments: args,
					});

					// Update last sync time com AWAIT
					await this.env.DB.prepare(`
						UPDATE mcp_client_connections
						SET last_sync = ?
						WHERE name = ?
					`).bind(Date.now(), serverName).run();

					return {
						content: [
							{
								type: "text",
								text: `Result from ${serverName}.${toolName}:\n\n${JSON.stringify(toolResult, null, 2)}`,
							},
						],
					};
				} catch (error) {
					return {
						content: [
							{
								type: "text",
								text: `Error calling tool '${toolName}' on server '${serverName}': ${error instanceof Error ? error.message : String(error)}`,
							},
						],
					};
				}
			},
		);

		// Tool 15: Deploy MCP server using Wrangler
		this.server.tool(
			"wrangler_deploy",
			{
				serverId: z.string().describe("ID of the MCP server to deploy")
			},
			async ({ serverId }) => {
				try {
					// Get server config from D1
					const config = await this.getServerFromDB(serverId);
					if (!config) {
						return {
							content: [{
								type: "text",
								text: `Error: Server '${serverId}' not found. Create it first using init_mcp_server.`
							}]
						};
					}

					if (!config.container_id) {
						return {
							content: [{
								type: "text",
								text: `Error: Server '${serverId}' has no container. Something went wrong during initialization.`
							}]
						};
					}

					const workspacePath = config.metadata?.workspacePath || `/workspace/${serverId}`;
					const workerName = config.wranglerConfig?.name || `mcp-${serverId}`;

					// Update status to building
					config.status = 'building';
					await this.saveServerToDB(serverId, config);

					// Build MCP server in container (reads from workspace)
					const buildResult = await this.env.CONTAINER_MANAGER.buildMCPServer(
						config.container_id,
						serverId,
						{} // Empty - buildMCPServer will read from workspace
					);

					if (!buildResult.success) {
						config.status = 'failed';
						config.metadata = { ...config.metadata, error: buildResult.error };
						await this.saveServerToDB(serverId, config);

						return {
							content: [{
								type: "text",
								text: `❌ Build failed: ${buildResult.error}`
							}]
						};
					}

					// Update status to deploying
					config.status = 'deploying';
					await this.saveServerToDB(serverId, config);

					// Deploy via WORKER_PUBLISHER
					const deployResult = await this.env.WORKER_PUBLISHER.deployFromMetaMCP(
						serverId,
						workerName,
						buildResult.scriptContent
					);

					if (!deployResult.success) {
						config.status = 'failed';
						config.metadata = { ...config.metadata, error: deployResult.error };
						await this.saveServerToDB(serverId, config);

						return {
							content: [{
								type: "text",
								text: `❌ Deployment failed: ${deployResult.error}`
							}]
						};
					}

					// Update final status to active
					config.status = 'active';
					config.metadata = {
						...config.metadata,
						deployedAt: Date.now(),
						deploymentUrl: deployResult.deploymentUrl,
						workerName
					};
					config.updatedAt = Date.now();
					await this.saveServerToDB(serverId, config);

					return {
						content: [{
							type: "text",
							text: `✅ MCP Server deployed successfully!

Server ID: ${serverId}
Worker Name: ${workerName}
Deployment URL: ${deployResult.deploymentUrl}
Tools: ${config.tools.length}
Resources: ${config.resources.length}
Prompts: ${config.prompts.length}

🔗 Connect using: ${deployResult.deploymentUrl}/sse`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Tool 16: Connect to external MCP server using MCPClientRPC
		this.server.tool(
			"connect_external_mcp",
			{
				serverId: z.string().describe("Unique ID for this connection"),
				serverUrl: z.string().describe("MCP server URL (e.g., https://server.workers.dev/sse)"),
				serverName: z.string().describe("Friendly name for the server")
			},
			async ({ serverId, serverUrl, serverName }) => {
				try {
					const result = await this.env.MCP_CLIENT.connectToServer(serverId, serverUrl, serverName);

					if (!result.success) {
						return {
							content: [{
								type: "text",
								text: `Connection failed: ${result.error}`
							}]
						};
					}

					return {
						content: [{
							type: "text",
							text: `✅ Connected to external MCP server!

Connection ID: ${result.connectionId}
Server URL: ${serverUrl}
Tools available: ${result.tools?.length || 0}

${result.tools?.map((t: any) => `- ${t.name}: ${t.description}`).join('\n') || 'No tools'}

Use call_mcp_tool to invoke tools from this server.`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Tool 17: Initialize Container
		this.server.tool(
			"container_initialize",
			{
				containerId: z.string().describe("Container ID to initialize"),
				image: z.enum(["python:3.12-slim", "python:3.11-slim", "node:20-alpine", "node:18-alpine", "ubuntu:24.04"]).optional().describe("Container image (default: python:3.12-slim)"),
				env: z.record(z.string()).optional().describe("Environment variables"),
				workdir: z.string().optional().describe("Working directory (default: /workspace)")
			},
			async ({ containerId, image, env, workdir }) => {
				try {
					// Validate container exists
					const container = this.env.MY_CONTAINER.get(containerId);
					if (!container) {
						return {
							content: [{
								type: "text",
								text: `Error: Container '${containerId}' not found. Create it first using init_mcp_server.`
							}]
						};
					}

					// Set up environment with optimizations
					const defaultEnv = {
						PYTHONUNBUFFERED: "1",
						TERM: "xterm-256color",
						...(env || {})
					};

					const envCommands = Object.entries(defaultEnv)
						.map(([key, value]) => `export ${key}="${value}"`)
						.join(" && ");

					// Initialize container with setup commands
					const setupCmd = `
						${envCommands} &&
						cd ${workdir || "/workspace"} &&
						echo "Container initialized with ${image || "python:3.12-slim"}" &&
						python3 --version 2>/dev/null || echo "Python not available" &&
						node --version 2>/dev/null || echo "Node not available"
					`.trim();

					const result = await container.execCommand(setupCmd);

					if (!result.success) {
						return {
							content: [{
								type: "text",
								text: `Error initializing container: ${result.output}`
							}]
						};
					}

					return {
						content: [{
							type: "text",
							text: `✅ Container initialized successfully!

Container ID: ${containerId}
Image: ${image || "python:3.12-slim"}
Working Directory: ${workdir || "/workspace"}
Environment Variables: ${Object.keys(defaultEnv).length}

Output:
${result.output}

Ready to execute commands with container_exec.`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Tool 18: Execute Command in Container
		this.server.tool(
			"container_exec",
			{
				containerId: z.string().describe("Container ID where to execute command"),
				args: z.string().describe("Command to execute (e.g., 'python3 -c \"print(2+2)\"')"),
				timeout: z.number().optional().default(30000).describe("Timeout in milliseconds (default: 30000)"),
				streamStderr: z.boolean().optional().default(true).describe("Include stderr in output")
			},
			async ({ containerId, args, timeout, streamStderr }) => {
				try {
					// Security: Validate command for dangerous patterns
					const dangerousPatterns = [
						/rm\s+-rf\s+\/(?!workspace)/,
						/:\(\)\{.*\}/,
						/fork\s*bomb/i,
						/while\s*true\s*;\s*do/i
					];

					for (const pattern of dangerousPatterns) {
						if (pattern.test(args)) {
							return {
								content: [{
									type: "text",
									text: `⚠️ Security Error: Potentially dangerous command detected and blocked.

Command: ${args}

Reason: This command matches a dangerous pattern that could harm the system.`
								}]
							};
						}
					}

					const container = this.env.MY_CONTAINER.get(containerId);
					if (!container) {
						return {
							content: [{
								type: "text",
								text: `Error: Container '${containerId}' not found.`
							}]
						};
					}

					const startTime = Date.now();
					const result = await Promise.race([
						container.execCommand(args),
						new Promise<{ success: false; output: string }>((_, reject) =>
							setTimeout(() => reject(new Error(`Command timed out after ${timeout}ms`)), timeout)
						)
					]);

					const duration = Date.now() - startTime;

					if (!result.success) {
						return {
							content: [{
								type: "text",
								text: `❌ Command failed (${duration}ms):

Command: ${args}

Error:
${result.output}`
							}]
						};
					}

					return {
						content: [{
							type: "text",
							text: `✅ Command executed successfully (${duration}ms)

Command: ${args}

Output:
${result.output || "(no output)"}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Tool 19: Write File in Container
		this.server.tool(
			"container_file_write",
			{
				containerId: z.string().describe("Container ID"),
				path: z.string().describe("Absolute path to the file (must be in /workspace)"),
				text: z.string().describe("Full text content of the file"),
				encoding: z.enum(["utf-8", "base64"]).optional().default("utf-8").describe("File encoding"),
				createDirs: z.boolean().optional().default(true).describe("Create parent directories if needed")
			},
			async ({ containerId, path, text, encoding, createDirs }) => {
				try {
					// Security: Validate path
					if (path.includes("..") || path.startsWith("/etc") || path.startsWith("/sys") || path.startsWith("/proc")) {
						return {
							content: [{
								type: "text",
								text: `⚠️ Security Error: Invalid or unsafe path: ${path}

Paths must:
- Be within /workspace
- Not contain ".."
- Not access system directories (/etc, /sys, /proc)`
							}]
						};
					}

					if (!path.startsWith("/workspace") && !path.startsWith("./")) {
						return {
							content: [{
								type: "text",
								text: `Error: Path must be within /workspace: ${path}`
							}]
						};
					}

					const container = this.env.MY_CONTAINER.get(containerId);
					if (!container) {
						return {
							content: [{
								type: "text",
								text: `Error: Container '${containerId}' not found.`
							}]
						};
					}

					// Create parent directories if needed
					if (createDirs) {
						const dir = path.substring(0, path.lastIndexOf("/"));
						if (dir && dir !== "/workspace") {
							const mkdirResult = await container.execCommand(`mkdir -p "${dir}"`);
							if (!mkdirResult.success) {
								return {
									content: [{
										type: "text",
										text: `Error creating parent directories: ${mkdirResult.output}`
									}]
								};
							}
						}
					}

					// Write file
					const result = await container.writeFile(path, text);

					if (!result.success) {
						return {
							content: [{
								type: "text",
								text: `Error writing file: ${result.content}`
							}]
						};
					}

					const size = Buffer.byteLength(text, encoding as BufferEncoding);

					return {
						content: [{
							type: "text",
							text: `✅ File written successfully!

Path: ${path}
Size: ${(size / 1024).toFixed(2)} KB
Encoding: ${encoding}

${size > 1024 * 1024 ? "⚠️ Large file detected. Consider using chunking for files >1MB." : ""}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Tool 20: Read File from Container
		this.server.tool(
			"container_file_read",
			{
				containerId: z.string().describe("Container ID"),
				path: z.string().describe("Absolute path to file or directory"),
				encoding: z.enum(["utf-8", "base64"]).optional().describe("File encoding (auto for images)")
			},
			async ({ containerId, path, encoding }) => {
				try {
					// Security: Validate path
					if (path.includes("..") || path.startsWith("/etc") || path.startsWith("/proc")) {
						return {
							content: [{
								type: "text",
								text: `⚠️ Security Error: Invalid or unsafe path: ${path}`
							}]
						};
					}

					const container = this.env.MY_CONTAINER.get(containerId);
					if (!container) {
						return {
							content: [{
								type: "text",
								text: `Error: Container '${containerId}' not found.`
							}]
						};
					}

					// Auto-detect encoding for images
					const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
					const isImage = imageExtensions.some(ext => path.toLowerCase().endsWith(ext));
					const actualEncoding = isImage ? "base64" : (encoding || "utf-8");

					const result = await container.readFile(path);

					if (!result.success) {
						return {
							content: [{
								type: "text",
								text: `❌ Error reading file: ${result.content}

Path: ${path}

Make sure the file exists and is readable.`
							}]
						};
					}

					const size = Buffer.byteLength(result.content, "utf-8");

					return {
						content: [{
							type: "text",
							text: `✅ File read successfully!

Path: ${path}
Size: ${(size / 1024).toFixed(2)} KB
Encoding: ${actualEncoding}
${isImage ? "Type: Image (automatically base64 encoded)" : ""}

Content:
${result.content.length > 5000 ? result.content.substring(0, 5000) + "\n\n... (truncated, file is too large)" : result.content}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Tool 21: List Files in Container
		this.server.tool(
			"container_files_list",
			{
				containerId: z.string().describe("Container ID"),
				path: z.string().optional().default("/workspace").describe("Directory path"),
				recursive: z.boolean().optional().default(false).describe("List subdirectories recursively"),
				maxDepth: z.number().optional().default(2).describe("Maximum recursion depth"),
				filter: z.string().optional().describe("Filter pattern (supports * and ?)")
			},
			async ({ containerId, path, recursive, maxDepth, filter }) => {
				try {
					const container = this.env.MY_CONTAINER.get(containerId);
					if (!container) {
						return {
							content: [{
								type: "text",
								text: `Error: Container '${containerId}' not found.`
							}]
						};
					}

					// Build ls command with options
					const lsCmd = recursive
						? `find "${path}" -maxdepth ${maxDepth} -type f ${filter ? `-name "${filter}"` : ""} -ls 2>/dev/null | awk '{print $11 " (" $7 " bytes)"}'`
						: `ls -lh "${path}" 2>/dev/null | tail -n +2 | awk '{print $9 " (" $5 ")"}'`;

					const result = await container.execCommand(lsCmd);

					if (!result.success) {
						return {
							content: [{
								type: "text",
								text: `Error listing files: ${result.output}`
							}]
						};
					}

					const output = result.output.trim();
					if (!output) {
						return {
							content: [{
								type: "text",
								text: `📁 Directory is empty: ${path}`
							}]
						};
					}

					const lines = output.split("\n");
					const fileCount = lines.length;

					return {
						content: [{
							type: "text",
							text: `📁 Files in ${path} (${fileCount} items):

${output}

Options:
- Recursive: ${recursive}
- Max Depth: ${maxDepth}
${filter ? `- Filter: ${filter}` : ""}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);

		// Tool 22: Delete File in Container
		this.server.tool(
			"container_file_delete",
			{
				containerId: z.string().describe("Container ID"),
				path: z.string().describe("Path to delete (must be in /workspace)"),
				recursive: z.boolean().optional().default(false).describe("Delete directories recursively"),
				force: z.boolean().optional().default(false).describe("Continue on errors")
			},
			async ({ containerId, path, recursive, force }) => {
				try {
					// Security: Validate path
					const protectedPaths = ["/", "/etc", "/sys", "/proc", "/usr", "/bin", "/sbin", "/lib", "/boot"];

					if (protectedPaths.some(p => path === p || path.startsWith(p + "/"))) {
						return {
							content: [{
								type: "text",
								text: `⚠️ Security Error: Cannot delete protected path: ${path}

Protected paths include:
- System directories (/etc, /sys, /proc, /usr, /bin, /lib)
- Root directory (/)

Only files in /workspace can be deleted.`
							}]
						};
					}

					if (!path.startsWith("/workspace")) {
						return {
							content: [{
								type: "text",
								text: `Error: Can only delete files in /workspace: ${path}`
							}]
						};
					}

					const container = this.env.MY_CONTAINER.get(containerId);
					if (!container) {
						return {
							content: [{
								type: "text",
								text: `Error: Container '${containerId}' not found.`
							}]
						};
					}

					// Check if path exists and is directory
					const checkCmd = `test -e "${path}" && echo "exists" || echo "not_found"; test -d "${path}" && echo "directory" || echo "file"`;
					const checkResult = await container.execCommand(checkCmd);

					if (checkResult.output.includes("not_found")) {
						if (force) {
							return {
								content: [{
									type: "text",
									text: `⚠️ Path does not exist: ${path} (ignored with force=true)`
								}]
							};
						}
						return {
							content: [{
								type: "text",
								text: `Error: Path does not exist: ${path}`
							}]
						};
					}

					const isDir = checkResult.output.includes("directory");

					if (isDir && !recursive) {
						return {
							content: [{
								type: "text",
								text: `Error: Cannot delete directory without recursive flag: ${path}`
							}]
						};
					}

					// Execute deletion
					const rmCmd = isDir
						? `rm -r${force ? "f" : ""} "${path}"`
						: `rm ${force ? "-f" : ""} "${path}"`;

					const result = await container.execCommand(rmCmd);

					if (!result.success && !force) {
						return {
							content: [{
								type: "text",
								text: `❌ Error deleting ${isDir ? "directory" : "file"}: ${result.output}`
							}]
						};
					}

					return {
						content: [{
							type: "text",
							text: `✅ Successfully deleted ${isDir ? "directory" : "file"}: ${path}

${recursive ? "All contents were deleted recursively." : ""}
${force ? "Force mode was enabled." : ""}`
						}]
					};
				} catch (error) {
					return {
						content: [{
							type: "text",
							text: `Error: ${error instanceof Error ? error.message : String(error)}`
						}]
					};
				}
			}
		);
	}

	// State update handler
	onStateUpdate(state: MetaMCPState | undefined, source: Connection | "server"): void {
		console.log("State updated from:", source === "server" ? "server" : "client connection");
		// Clients connected via SSE will automatically receive state updates
	}

	// Database initialization
	private async initializeDatabase(): Promise<void> {
		if (this.isDbInitialized) return;

		// Create mcp_servers table
		this.sql`
			CREATE TABLE IF NOT EXISTS mcp_servers (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				version TEXT NOT NULL,
				description TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				wrangler_config TEXT NOT NULL
			)
		`;

		// Create mcp_tools table
		this.sql`
			CREATE TABLE IF NOT EXISTS mcp_tools (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				server_id TEXT NOT NULL,
				name TEXT NOT NULL,
				description TEXT NOT NULL,
				parameters TEXT NOT NULL,
				implementation TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
				UNIQUE(server_id, name)
			)
		`;

		// Create mcp_resources table
		this.sql`
			CREATE TABLE IF NOT EXISTS mcp_resources (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				server_id TEXT NOT NULL,
				uri TEXT NOT NULL,
				name TEXT NOT NULL,
				description TEXT NOT NULL,
				mime_type TEXT NOT NULL,
				implementation TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
				UNIQUE(server_id, uri)
			)
		`;

		// Create mcp_prompts table
		this.sql`
			CREATE TABLE IF NOT EXISTS mcp_prompts (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				server_id TEXT NOT NULL,
				name TEXT NOT NULL,
				description TEXT NOT NULL,
				arguments TEXT NOT NULL,
				template TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE,
				UNIQUE(server_id, name)
			)
		`;

		// Create cleanup_requests table
		this.sql`
			CREATE TABLE IF NOT EXISTS cleanup_requests (
				id TEXT PRIMARY KEY,
				requested_at INTEGER NOT NULL,
				servers_to_delete TEXT NOT NULL,
				status TEXT NOT NULL,
				responded_at INTEGER
			)
		`;

		// Create mcp_client_connections table
		this.sql`
			CREATE TABLE IF NOT EXISTS mcp_client_connections (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE,
				url TEXT NOT NULL,
				status TEXT NOT NULL,
				last_sync INTEGER NOT NULL,
				capabilities TEXT,
				tools_count INTEGER DEFAULT 0,
				resources_count INTEGER DEFAULT 0,
				created_at INTEGER NOT NULL
			)
		`;

		// Create indexes
		this.sql`CREATE INDEX IF NOT EXISTS idx_mcp_tools_server_id ON mcp_tools(server_id)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_mcp_resources_server_id ON mcp_resources(server_id)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_mcp_prompts_server_id ON mcp_prompts(server_id)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_cleanup_status ON cleanup_requests(status, requested_at)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_mcp_servers_updated ON mcp_servers(updated_at)`;
		this.sql`CREATE INDEX IF NOT EXISTS idx_mcp_connections_status ON mcp_client_connections(status)`;

		this.isDbInitialized = true;
	}

	// SQL helper methods for CRUD operations
	private async getServerFromDB(serverId: string): Promise<MCPServerConfig | null> {
		// Query principal com AWAIT
		const serverResult = await this.env.DB.prepare(`
			SELECT * FROM mcp_servers WHERE id = ?
		`).bind(serverId).first();

		if (!serverResult) return null;

		// Buscar tools relacionadas
		const toolsResult = await this.env.DB.prepare(`
			SELECT * FROM mcp_tools WHERE server_id = ?
		`).bind(serverId).all();

		const tools = (toolsResult.results || []).map((t: any) => ({
			name: t.name,
			description: t.description,
			parameters: JSON.parse(t.parameters),
			implementation: t.implementation,
		}));

		// Buscar resources
		const resourcesResult = await this.env.DB.prepare(`
			SELECT * FROM mcp_resources WHERE server_id = ?
		`).bind(serverId).all();

		const resources = (resourcesResult.results || []).map((r: any) => ({
			uri: r.uri,
			name: r.name,
			description: r.description,
			mimeType: r.mime_type,
			implementation: r.implementation,
		}));

		// Buscar prompts
		const promptsResult = await this.env.DB.prepare(`
			SELECT * FROM mcp_prompts WHERE server_id = ?
		`).bind(serverId).all();

		const prompts = (promptsResult.results || []).map((p: any) => ({
			name: p.name,
			description: p.description,
			arguments: JSON.parse(p.arguments),
			template: p.template,
		}));

		// Retornar com TODOS os campos (incluindo novos)
		return {
			id: serverResult.id as string,
			name: serverResult.name as string,
			version: serverResult.version as string,
			description: serverResult.description as string,
			tools,
			resources,
			prompts,
			wranglerConfig: JSON.parse(serverResult.wrangler_config as string),
			createdAt: serverResult.created_at as number,
			updatedAt: serverResult.updated_at as number,
			status: serverResult.status as any,
			worker_name: serverResult.worker_name as string | undefined,
			container_id: serverResult.container_id as string | undefined,
			metadata: serverResult.metadata ? JSON.parse(serverResult.metadata as string) : undefined,
		};
	}

	private async saveServerToDB(serverId: string, config: MCPServerConfig): Promise<void> {
		// Insert or update server com AWAIT e TODOS os campos
		await this.env.DB.prepare(`
			INSERT INTO mcp_servers (
				id, name, version, description,
				status, worker_name, container_id, metadata,
				created_at, updated_at, wrangler_config
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				version = excluded.version,
				description = excluded.description,
				status = excluded.status,
				worker_name = excluded.worker_name,
				container_id = excluded.container_id,
				metadata = excluded.metadata,
				updated_at = excluded.updated_at,
				wrangler_config = excluded.wrangler_config
		`).bind(
			serverId,
			config.name,
			config.version,
			config.description,
			config.status || 'draft',
			config.worker_name || null,
			config.container_id || null,
			config.metadata ? JSON.stringify(config.metadata) : null,
			config.createdAt,
			config.updatedAt,
			JSON.stringify(config.wranglerConfig)
		).run();

		// Delete existing tools/resources/prompts for this server com AWAIT
		await this.env.DB.prepare(`DELETE FROM mcp_tools WHERE server_id = ?`).bind(serverId).run();
		await this.env.DB.prepare(`DELETE FROM mcp_resources WHERE server_id = ?`).bind(serverId).run();
		await this.env.DB.prepare(`DELETE FROM mcp_prompts WHERE server_id = ?`).bind(serverId).run();

		// Insert tools com AWAIT
		for (const tool of config.tools) {
			await this.env.DB.prepare(`
				INSERT INTO mcp_tools (server_id, name, description, parameters, implementation, created_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`).bind(
				serverId,
				tool.name,
				tool.description,
				JSON.stringify(tool.parameters),
				tool.implementation,
				Date.now()
			).run();
		}

		// Insert resources com AWAIT
		for (const resource of config.resources) {
			await this.env.DB.prepare(`
				INSERT INTO mcp_resources (server_id, uri, name, description, mime_type, implementation, created_at)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`).bind(
				serverId,
				resource.uri,
				resource.name,
				resource.description,
				resource.mimeType,
				resource.implementation,
				Date.now()
			).run();
		}

		// Insert prompts com AWAIT
		for (const prompt of config.prompts) {
			await this.env.DB.prepare(`
				INSERT INTO mcp_prompts (server_id, name, description, arguments, template, created_at)
				VALUES (?, ?, ?, ?, ?, ?)
			`).bind(
				serverId,
				prompt.name,
				prompt.description,
				JSON.stringify(prompt.arguments),
				prompt.template,
				Date.now()
			).run();
		}
	}

	private async deleteServerFromDB(serverId: string): Promise<boolean> {
		// Query com AWAIT
		const result = await this.env.DB.prepare(`
			DELETE FROM mcp_servers WHERE id = ?
		`).bind(serverId).run();

		// Verificar se deletou algo
		return (result.meta?.changes || 0) > 0;
	}

	private async listServersFromDB(): Promise<MCPServerConfig[]> {
		// Query com AWAIT
		const serverResult = await this.env.DB.prepare(`
			SELECT * FROM mcp_servers ORDER BY created_at DESC
		`).all();

		const serverRows = serverResult.results || [];
		const servers: MCPServerConfig[] = [];

		// Para cada servidor, buscar detalhes completos
		for (const server of serverRows) {
			const config = await this.getServerFromDB((server as any).id);
			if (config) servers.push(config);
		}

		return servers;
	}

	// State update helpers
	private async updateServerStats(): Promise<void> {
		const servers = await this.listServersFromDB();

		let totalTools = 0;
		let totalResources = 0;
		let totalPrompts = 0;

		for (const server of servers) {
			totalTools += server.tools.length;
			totalResources += server.resources.length;
			totalPrompts += server.prompts.length;
		}

		const newState: Partial<MetaMCPState> = {
			totalServers: servers.length,
			totalTools,
			totalResources,
			totalPrompts,
			lastHealthCheck: Date.now(),
			databaseHealth: "healthy",
		};

		this.setState({ ...this.state, ...newState });
	}

	private async notifyServerCreated(name: string): Promise<void> {
		await this.updateServerStats();
		this.setState({
			...this.state,
			lastServerCreated: { name, timestamp: Date.now() },
		});
	}

	private async notifyServerUpdated(name: string): Promise<void> {
		await this.updateServerStats();
		this.setState({
			...this.state,
			lastServerUpdated: { name, timestamp: Date.now() },
		});
	}

	private async notifyServerDeleted(name: string): Promise<void> {
		await this.updateServerStats();
		this.setState({
			...this.state,
			lastServerDeleted: { name, timestamp: Date.now() },
		});
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
			// Note: When CF_ACCESS_ENABLED=true, you MUST configure Cloudflare Access
			// in the dashboard for domain meta-mcp.voither.workers.dev
			// The dashboard Access handles ALL authentication - the Worker just passes requests through
			const accessConfig: CloudflareAccessConfig = {
				enabled: env.CF_ACCESS_ENABLED !== "false", // Default to enabled
			};

			// Note: No validation needed in Worker when Cloudflare Access is enabled in dashboard
			// Access intercepts requests BEFORE they reach the Worker
			const authError = await validateCloudflareAccess(request, accessConfig);
			if (authError) {
				return authError;
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
