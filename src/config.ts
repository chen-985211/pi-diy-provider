import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { copyFile, mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname } from "node:path";

export const SUPPORTED_APIS = [
	"openai-completions",
	"openai-responses",
	"anthropic-messages",
	"google-generative-ai",
] as const;

export type SupportedApi = (typeof SUPPORTED_APIS)[number];

export interface ProviderInput {
	providerId: string;
	displayName: string;
	baseUrl: string;
	api: SupportedApi;
	modelIds: readonly string[];
	allowEmptyModels?: boolean;
}

export interface StoredProvider {
	providerId: string;
	displayName: string;
	baseUrl: string;
	api: SupportedApi;
	modelIds: readonly string[];
}

export interface WriteResult {
	changed: boolean;
	modelsPath: string;
	backupPath?: string;
}

interface ModelsDocument {
	providers: Record<string, unknown>;
	[key: string]: unknown;
}

interface LoadedDocument {
	document: ModelsDocument;
	exists: boolean;
	original?: string;
	mode?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripJsonComments(source: string): string {
	let result = "";
	let inString = false;
	let escaped = false;
	let inLineComment = false;
	let inBlockComment = false;

	for (let index = 0; index < source.length; index++) {
		const current = source[index] ?? "";
		const next = source[index + 1] ?? "";

		if (inLineComment) {
			if (current === "\n" || current === "\r") {
				inLineComment = false;
				result += current;
			} else {
				result += " ";
			}
			continue;
		}

		if (inBlockComment) {
			if (current === "*" && next === "/") {
				result += "  ";
				index++;
				inBlockComment = false;
			} else {
				result += current === "\n" || current === "\r" ? current : " ";
			}
			continue;
		}

		if (inString) {
			result += current;
			if (escaped) {
				escaped = false;
			} else if (current === "\\") {
				escaped = true;
			} else if (current === '"') {
				inString = false;
			}
			continue;
		}

		if (current === '"') {
			inString = true;
			result += current;
		} else if (current === "/" && next === "/") {
			inLineComment = true;
			result += "  ";
			index++;
		} else if (current === "/" && next === "*") {
			inBlockComment = true;
			result += "  ";
			index++;
		} else {
			result += current;
		}
	}

	if (inBlockComment) throw new Error("models.json contains an unterminated block comment.");
	return result;
}

function parseDocument(source: string, modelsPath: string): ModelsDocument {
	let parsed: unknown;
	try {
		parsed = JSON.parse(stripJsonComments(source.replace(/^\uFEFF/, "")));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`Cannot parse ${modelsPath}: ${message}`);
	}
	if (!isRecord(parsed)) throw new Error(`${modelsPath} must contain a JSON object.`);
	if (!("providers" in parsed)) return { ...parsed, providers: {} };
	if (!isRecord(parsed.providers)) throw new Error(`${modelsPath} must contain a \"providers\" object.`);
	return { ...parsed, providers: { ...parsed.providers } } as ModelsDocument;
}

async function loadDocument(modelsPath: string): Promise<LoadedDocument> {
	try {
		const [original, metadata] = await Promise.all([readFile(modelsPath, "utf8"), stat(modelsPath)]);
		return {
			document: parseDocument(original, modelsPath),
			exists: true,
			original,
			mode: metadata.mode & 0o777,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return { document: { providers: {} }, exists: false };
		}
		throw error;
	}
}

export async function hasProvider(modelsPath: string, providerId: string): Promise<boolean> {
	const loaded = await loadDocument(modelsPath);
	return Object.hasOwn(loaded.document.providers, providerId);
}

export async function readProvider(modelsPath: string, providerId: string): Promise<StoredProvider | undefined> {
	const loaded = await loadDocument(modelsPath);
	const value = loaded.document.providers[providerId];
	if (value === undefined) return undefined;
	if (!isRecord(value)) throw new Error(`Provider "${providerId}" in ${modelsPath} must be an object.`);
	if (typeof value.baseUrl !== "string" || validateBaseUrl(value.baseUrl)) {
		throw new Error(`Provider "${providerId}" does not have a valid Base URL.`);
	}
	if (typeof value.api !== "string" || !SUPPORTED_APIS.includes(value.api as SupportedApi)) {
		throw new Error(`Provider "${providerId}" does not use a supported API type.`);
	}
	const models = Array.isArray(value.models) ? value.models : [];
	const modelIds = models.flatMap((model) =>
		isRecord(model) && typeof model.id === "string" && model.id ? [model.id] : [],
	);
	return {
		providerId,
		displayName: typeof value.name === "string" && value.name ? value.name : providerId,
		baseUrl: value.baseUrl,
		api: value.api as SupportedApi,
		modelIds,
	};
}

export function validateProviderId(value: string): string | undefined {
	if (!value) return "Provider id is required.";
	if (value.length > 64) return "Provider id must be at most 64 characters.";
	if (!/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
		return "Use lowercase letters, numbers, dots, underscores, and hyphens; start with a letter or number.";
	}
	if (["__proto__", "constructor", "prototype"].includes(value)) return "Choose a different provider id.";
	return undefined;
}

export function validateDisplayName(value: string): string | undefined {
	if (!value) return "Display name is required.";
	if (value.length > 100) return "Display name must be at most 100 characters.";
	if (/\p{Cc}/u.test(value)) return "Display name cannot contain control characters.";
	return undefined;
}

export function validateBaseUrl(value: string): string | undefined {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return "Enter a valid absolute URL.";
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") return "Base URL must use http or https.";
	if (url.username || url.password) return "Base URL must not contain credentials.";
	return undefined;
}

export function parseModelIds(value: string): string[] {
	return [...new Set(value.split(",").map((modelId) => modelId.trim()).filter(Boolean))];
}

export function validateModelIds(modelIds: readonly string[]): string | undefined {
	if (modelIds.length === 0) return "Enter at least one model id.";
	const invalid = modelIds.find((modelId) => modelId.length > 256 || /\p{Cc}/u.test(modelId));
	if (invalid) return `Invalid model id: ${invalid}`;
	return undefined;
}

function validateInput(input: ProviderInput): void {
	const error =
		validateProviderId(input.providerId) ??
		validateDisplayName(input.displayName) ??
		validateBaseUrl(input.baseUrl) ??
		(input.allowEmptyModels && input.modelIds.length === 0 ? undefined : validateModelIds(input.modelIds));
	if (error) throw new Error(error);
	if (!SUPPORTED_APIS.includes(input.api)) throw new Error(`Unsupported API type: ${input.api}`);
}

async function reserveBackupPath(modelsPath: string, now: Date): Promise<string> {
	const timestamp = now.toISOString().replaceAll("-", "").replaceAll(":", "").replace(".", "");
	for (let suffix = 0; ; suffix++) {
		const candidate = `${modelsPath}.backup-${timestamp}${suffix === 0 ? "" : `-${suffix}`}`;
		try {
			await copyFile(modelsPath, candidate, constants.COPYFILE_EXCL);
			return candidate;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
	}
}

async function atomicWrite(modelsPath: string, contents: string, mode: number): Promise<void> {
	const temporaryPath = `${modelsPath}.tmp-${process.pid}-${randomUUID()}`;
	let handle: Awaited<ReturnType<typeof open>> | undefined;
	try {
		handle = await open(temporaryPath, "wx", mode);
		await handle.writeFile(contents, "utf8");
		await handle.sync();
		await handle.close();
		handle = undefined;
		await rename(temporaryPath, modelsPath);
	} catch (error) {
		await handle?.close().catch(() => {});
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
}

async function persistDocument(
	modelsPath: string,
	loaded: LoadedDocument,
	document: ModelsDocument,
	now: Date,
): Promise<WriteResult> {
	const contents = `${JSON.stringify(document, null, 2)}\n`;
	if (loaded.original === contents) return { changed: false, modelsPath };
	await mkdir(dirname(modelsPath), { recursive: true, mode: 0o700 });
	const backupPath = loaded.exists ? await reserveBackupPath(modelsPath, now) : undefined;
	await atomicWrite(modelsPath, contents, loaded.mode ?? 0o600);
	return backupPath ? { changed: true, modelsPath, backupPath } : { changed: true, modelsPath };
}

export async function writeProvider(
	modelsPath: string,
	input: ProviderInput,
	now: Date = new Date(),
): Promise<WriteResult> {
	validateInput(input);
	const loaded = await loadDocument(modelsPath);
	const provider = {
		name: input.displayName,
		baseUrl: input.baseUrl,
		api: input.api,
		models: input.modelIds.map((id) => ({ id })),
	};
	const document: ModelsDocument = {
		...loaded.document,
		providers: {
			...loaded.document.providers,
			[input.providerId]: provider,
		},
	};
	return persistDocument(modelsPath, loaded, document, now);
}

export async function writeProviderModels(
	modelsPath: string,
	providerId: string,
	modelIds: readonly string[],
	now: Date = new Date(),
): Promise<WriteResult> {
	const validationError = validateModelIds(modelIds);
	if (validationError) throw new Error(validationError);
	const loaded = await loadDocument(modelsPath);
	const existing = loaded.document.providers[providerId];
	if (!isRecord(existing)) throw new Error(`Provider "${providerId}" was not found in ${modelsPath}.`);
	const existingModels = Array.isArray(existing.models) ? existing.models : [];
	const modelsById = new Map<string, Record<string, unknown>>();
	for (const model of existingModels) {
		if (isRecord(model) && typeof model.id === "string") modelsById.set(model.id, model);
	}
	const provider = {
		...existing,
		models: modelIds.map((id) => modelsById.get(id) ?? { id }),
	};
	const document: ModelsDocument = {
		...loaded.document,
		providers: { ...loaded.document.providers, [providerId]: provider },
	};
	return persistDocument(modelsPath, loaded, document, now);
}
