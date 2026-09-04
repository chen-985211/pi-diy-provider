import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	hasProvider,
	parseModelIds,
	readProvider,
	SUPPORTED_APIS,
	type SupportedApi,
	validateBaseUrl,
	validateDisplayName,
	validateModelIds,
	validateProviderId,
	writeProvider,
	writeProviderModels,
} from "./config.ts";
import { discoverModels } from "./discovery.ts";

const API_LABELS = new Map<string, SupportedApi>([
	["OpenAI Chat Completions (default)", "openai-completions"],
	["OpenAI Responses", "openai-responses"],
	["Anthropic Messages", "anthropic-messages"],
	["Google Generative AI", "google-generative-ai"],
]);
const MODEL_SETUP_DISCOVER = "Discover models after /login (recommended)";
const MODEL_SETUP_MANUAL = "Enter model ids manually";

interface ExtensionOptions {
	modelsPath?: string;
	fetcher?: typeof fetch;
}

async function askValidated(
	ctx: ExtensionCommandContext,
	title: string,
	placeholder: string,
	validate: (value: string) => string | undefined,
): Promise<string | undefined> {
	while (true) {
		const answer = await ctx.ui.input(title, placeholder);
		if (answer === undefined) return undefined;
		const value = answer.trim();
		const error = validate(value);
		if (!error) return value;
		ctx.ui.notify(error, "warning");
	}
}

async function refreshProvider(
	ctx: ExtensionCommandContext,
	providerId: string,
	expectedModelIds: readonly string[],
): Promise<void> {
	const refresh = await ctx.modelRegistry.refresh({ allowNetwork: false, providers: [providerId] });
	const refreshError = refresh.errors.get(providerId);
	if (refreshError) throw refreshError;
	if (!ctx.modelRegistry.getProvider(providerId)) {
		throw new Error(`Pi did not load provider "${providerId}" from models.json.`);
	}
	const loadedModelIds = new Set(
		ctx.modelRegistry.getAll().filter((model) => model.provider === providerId).map((model) => model.id),
	);
	const missingModel = expectedModelIds.find((modelId) => !loadedModelIds.has(modelId));
	if (missingModel) throw new Error(`Pi did not load model "${providerId}/${missingModel}".`);
}

async function runProviderAdd(ctx: ExtensionCommandContext, modelsPath: string): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("/provider-add requires interactive UI.", "warning");
		return;
	}

	const providerId = await askValidated(ctx, "Provider id", "example-relay", validateProviderId);
	if (!providerId) return;
	if (await hasProvider(modelsPath, providerId)) {
		const replace = await ctx.ui.confirm(
			"Replace provider?",
			`Provider "${providerId}" already exists in models.json. A backup will be created before it is replaced.`,
		);
		if (!replace) return;
	}

	const displayName = await askValidated(ctx, "Display name", "Example Relay", validateDisplayName);
	if (!displayName) return;
	const baseUrl = await askValidated(ctx, "Base URL", "https://relay.example.com/v1", validateBaseUrl);
	if (!baseUrl) return;
	const apiLabel = await ctx.ui.select("API type", [...API_LABELS.keys()]);
	if (!apiLabel) return;
	const api = API_LABELS.get(apiLabel);
	if (!api || !SUPPORTED_APIS.includes(api)) {
		ctx.ui.notify("Unsupported API type.", "error");
		return;
	}

	const modelSetup = await ctx.ui.select("Model setup", [MODEL_SETUP_DISCOVER, MODEL_SETUP_MANUAL]);
	if (!modelSetup) return;
	let modelIds: string[] = [];
	if (modelSetup === MODEL_SETUP_MANUAL) {
		const modelList = await askValidated(ctx, "Model ids (comma-separated)", "model-id", (value) =>
			validateModelIds(parseModelIds(value)),
		);
		if (!modelList) return;
		modelIds = parseModelIds(modelList);
	}

	const confirmed = await ctx.ui.confirm(
		"Add provider?",
		[
			`${displayName} (${providerId})`,
			`${api} at ${baseUrl}`,
			modelIds.length > 0 ? `Models: ${modelIds.join(", ")}` : "Models: discover after API-key login",
			"The API key will not be written to models.json.",
		].join("\n"),
	);
	if (!confirmed) return;

	let backupPath: string | undefined;
	try {
		const result = await writeProvider(modelsPath, {
			providerId,
			displayName,
			baseUrl,
			api,
			modelIds,
			allowEmptyModels: modelIds.length === 0,
		});
		backupPath = result.backupPath;
		await refreshProvider(ctx, providerId, modelIds);
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return;
	}

	const backup = backupPath ? ` Backup: ${backupPath}.` : "";
	const nextStep =
		modelIds.length > 0
			? `Next run /login ${providerId}; after saving the key, select a model with /model.`
			: `Next run /login ${providerId}, then /provider-model-sync ${providerId}.`;
	ctx.ui.notify(`Configured ${displayName}.${backup} ${nextStep} Reloading Pi now.`, "info");
	await ctx.reload();
	return;
}

async function runProviderModelSync(
	args: string,
	ctx: ExtensionCommandContext,
	modelsPath: string,
	fetcher: typeof fetch,
): Promise<void> {
	if (!ctx.hasUI) {
		ctx.ui.notify("/provider-model-sync requires interactive UI.", "warning");
		return;
	}
	const providerId = args.trim() || (await askValidated(ctx, "Provider id", "example-relay", validateProviderId));
	if (!providerId) return;
	const idError = validateProviderId(providerId);
	if (idError) {
		ctx.ui.notify(idError, "error");
		return;
	}

	try {
		const provider = await readProvider(modelsPath, providerId);
		if (!provider) throw new Error(`Provider "${providerId}" was not found. Run /provider-add first.`);
		await refreshProvider(ctx, providerId, provider.modelIds);
		const resolution = await ctx.modelRegistry.getProviderAuth(providerId);
		if (!resolution) throw new Error(`No saved API key for "${providerId}". Run /login ${providerId} first.`);

		ctx.ui.notify(`Discovering models from ${provider.displayName}...`, "info");
		const discovered = await discoverModels(
			{
				api: provider.api,
				baseUrl: resolution.auth.baseUrl ?? provider.baseUrl,
				...(resolution.auth.apiKey ? { apiKey: resolution.auth.apiKey } : {}),
				...(resolution.auth.headers ? { headers: resolution.auth.headers } : {}),
				signal: AbortSignal.timeout(20_000),
			},
			fetcher,
		);
		const edited = await ctx.ui.editor(
			`Models discovered for ${provider.displayName} (edit comma-separated ids)`,
			discovered.map((model) => model.id).join(", "),
		);
		if (edited === undefined) return;
		const modelIds = parseModelIds(edited);
		const validationError = validateModelIds(modelIds);
		if (validationError) throw new Error(validationError);
		const confirmed = await ctx.ui.confirm(
			"Save discovered models?",
			`Replace the model list for ${providerId} with ${modelIds.length} model${modelIds.length === 1 ? "" : "s"}?`,
		);
		if (!confirmed) return;

		const result = await writeProviderModels(modelsPath, providerId, modelIds);
		await refreshProvider(ctx, providerId, modelIds);
		const backup = result.backupPath ? ` Backup: ${result.backupPath}.` : "";
		ctx.ui.notify(
			`Saved ${modelIds.length} models for ${provider.displayName}.${backup} Select one with /model. Reloading Pi now.`,
			"info",
		);
	} catch (error) {
		ctx.ui.notify(error instanceof Error ? error.message : String(error), "error");
		return;
	}

	await ctx.reload();
	return;
}

export function createProviderManagerExtension(options: ExtensionOptions = {}) {
	const modelsPath = options.modelsPath ?? join(homedir(), ".pi", "agent", "models.json");
	const fetcher = options.fetcher ?? fetch;
	return (pi: ExtensionAPI): void => {
		pi.registerCommand("provider-add", {
			description: "Add an API-key custom provider to models.json",
			handler: async (_args, ctx) => runProviderAdd(ctx, modelsPath),
		});
		pi.registerCommand("provider-model-sync", {
			description: "Discover and save models from a configured provider",
			handler: async (args, ctx) => runProviderModelSync(args, ctx, modelsPath, fetcher),
		});
	};
}

export default createProviderManagerExtension();
