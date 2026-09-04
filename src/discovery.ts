import type { SupportedApi } from "./config.ts";

export interface DiscoveryInput {
	api: SupportedApi;
	baseUrl: string;
	apiKey?: string;
	headers?: Record<string, string | null>;
	signal?: AbortSignal;
}

export interface DiscoveredModel {
	id: string;
	name?: string;
}

function hasHeader(headers: Headers, name: string): boolean {
	return [...headers.keys()].some((key) => key.toLowerCase() === name.toLowerCase());
}

export function buildModelsUrl(baseUrl: string, api: SupportedApi): string {
	const url = new URL(baseUrl);
	url.search = "";
	url.hash = "";
	const path = url.pathname.replace(/\/+$/, "");
	if (path.endsWith("/models")) return url.toString();

	if (api === "anthropic-messages") {
		url.pathname = `${path.endsWith("/v1") ? path : `${path}/v1`}/models`.replace(/^\/\//, "/");
	} else if (api === "google-generative-ai") {
		url.pathname = `${path.endsWith("/v1") || path.endsWith("/v1beta") ? path : `${path}/v1beta`}/models`.replace(
			/^\/\//,
			"/",
		);
	} else {
		url.pathname = `${path || "/v1"}/models`.replace(/^\/\//, "/");
	}
	return url.toString();
}

function requestHeaders(input: DiscoveryInput): Headers {
	const headers = new Headers({ accept: "application/json" });
	for (const [name, value] of Object.entries(input.headers ?? {})) {
		if (value !== null) headers.set(name, value);
	}
	if (!input.apiKey) return headers;
	if (input.api === "anthropic-messages") {
		if (!hasHeader(headers, "x-api-key")) headers.set("x-api-key", input.apiKey);
		if (!hasHeader(headers, "anthropic-version")) headers.set("anthropic-version", "2023-06-01");
	} else if (input.api === "google-generative-ai") {
		if (!hasHeader(headers, "x-goog-api-key")) headers.set("x-goog-api-key", input.apiKey);
	} else if (!hasHeader(headers, "authorization")) {
		headers.set("authorization", `Bearer ${input.apiKey}`);
	}
	return headers;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function extractModels(payload: unknown, api: SupportedApi): DiscoveredModel[] {
	let entries: unknown[];
	if (Array.isArray(payload)) {
		entries = payload;
	} else if (typeof payload === "object" && payload !== null) {
		const record = payload as Record<string, unknown>;
		if (Array.isArray(record.data)) entries = record.data;
		else if (Array.isArray(record.models)) entries = record.models;
		else entries = [];
	} else {
		entries = [];
	}

	const byId = new Map<string, DiscoveredModel>();
	for (const entry of entries) {
		if (typeof entry === "string") {
			const id = entry.trim();
			if (id) byId.set(id, { id });
			continue;
		}
		if (typeof entry !== "object" || entry === null) continue;
		const record = entry as Record<string, unknown>;
		let id = optionalString(record.id) ?? optionalString(record.name);
		if (!id) continue;
		if (api === "google-generative-ai" && id.startsWith("models/")) id = id.slice("models/".length);
		if (!id || id.length > 256 || /\p{Cc}/u.test(id)) continue;
		const name = optionalString(record.display_name) ?? optionalString(record.displayName);
		byId.set(id, name && name !== id ? { id, name } : { id });
	}
	return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export async function discoverModels(
	input: DiscoveryInput,
	fetcher: typeof fetch = fetch,
): Promise<DiscoveredModel[]> {
	const response = await fetcher(buildModelsUrl(input.baseUrl, input.api), {
		method: "GET",
		headers: requestHeaders(input),
		...(input.signal ? { signal: input.signal } : {}),
	});
	const body = await response.text();
	if (!response.ok) {
		const detail = body.replace(/\s+/g, " ").trim().slice(0, 240);
		throw new Error(`Model discovery failed (${response.status}${detail ? `: ${detail}` : ""}).`);
	}
	let payload: unknown;
	try {
		payload = JSON.parse(body);
	} catch {
		throw new Error("The provider returned a non-JSON model catalog.");
	}
	const models = extractModels(payload, input.api);
	if (models.length === 0) throw new Error("The provider returned no recognizable model ids.");
	return models;
}
