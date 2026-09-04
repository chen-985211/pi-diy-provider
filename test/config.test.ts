import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	parseModelIds,
	readProvider,
	validateBaseUrl,
	validateProviderId,
	writeProvider,
	writeProviderModels,
} from "../src/config.ts";

async function temporaryModelsPath(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "pi-diy-provider-"));
	const agentDirectory = join(directory, "agent");
	await mkdir(agentDirectory);
	return join(agentDirectory, "models.json");
}

describe("writeProvider", () => {
	it("creates a minimal provider without persisting an API key", async () => {
		const modelsPath = await temporaryModelsPath();
		const result = await writeProvider(modelsPath, {
			providerId: "acme-relay",
			displayName: "Acme Relay",
			baseUrl: "https://relay.example.com/v1",
			api: "openai-completions",
			modelIds: ["alpha", "beta"],
		});

		expect(result.backupPath).toBeUndefined();
		expect(JSON.parse(await readFile(modelsPath, "utf8"))).toEqual({
			providers: {
				"acme-relay": {
					name: "Acme Relay",
					baseUrl: "https://relay.example.com/v1",
					api: "openai-completions",
					models: [{ id: "alpha" }, { id: "beta" }],
				},
			},
		});
		expect(await readFile(modelsPath, "utf8")).not.toContain("apiKey");
	});

	it("preserves unrelated configuration and backs up an existing JSONC file", async () => {
		const modelsPath = await temporaryModelsPath();
		const original = `{
  // user metadata
  "metadata": { "owner": "user" },
  "providers": {
    "keep-me": { "baseUrl": "http://localhost:1234/v1", "api": "openai-completions", "models": [{ "id": "local" }] },
    "replace-me": { "apiKey": "must-not-survive", "oauth": "radius", "models": [{ "id": "old" }] }
  }
}\n`;
		await writeFile(modelsPath, original, { encoding: "utf8", mode: 0o640 });

		const result = await writeProvider(
			modelsPath,
			{
				providerId: "replace-me",
				displayName: "Replacement",
				baseUrl: "https://new.example.com/v1",
				api: "anthropic-messages",
				modelIds: ["new-model"],
			},
			new Date("2026-09-05T01:02:03.004Z"),
		);

		expect(result.backupPath).toContain("models.json.backup-20260905T010203004Z");
		expect(await readFile(result.backupPath!, "utf8")).toBe(original);
		const updated = JSON.parse(await readFile(modelsPath, "utf8"));
		expect(updated.metadata).toEqual({ owner: "user" });
		expect(updated.providers["keep-me"]).toEqual({
			baseUrl: "http://localhost:1234/v1",
			api: "openai-completions",
			models: [{ id: "local" }],
		});
		expect(updated.providers["replace-me"]).toEqual({
			name: "Replacement",
			baseUrl: "https://new.example.com/v1",
			api: "anthropic-messages",
			models: [{ id: "new-model" }],
		});
	});

	it("does not rewrite or back up an unchanged generated document", async () => {
		const modelsPath = await temporaryModelsPath();
		const input = {
			providerId: "same",
			displayName: "Same",
			baseUrl: "https://same.example.com/v1",
			api: "openai-responses" as const,
			modelIds: ["model"],
		};
		await writeProvider(modelsPath, input);
		const second = await writeProvider(modelsPath, input);

		expect(second.changed).toBe(false);
		expect((await readdir(join(modelsPath, ".."))).filter((name) => name.includes("backup"))).toEqual([]);
	});

	it("supports a provider shell for post-login discovery", async () => {
		const modelsPath = await temporaryModelsPath();
		await writeProvider(modelsPath, {
			providerId: "discoverable",
			displayName: "Discoverable",
			baseUrl: "https://relay.example.com/v1",
			api: "openai-completions",
			modelIds: [],
			allowEmptyModels: true,
		});

		expect(await readProvider(modelsPath, "discoverable")).toEqual({
			providerId: "discoverable",
			displayName: "Discoverable",
			baseUrl: "https://relay.example.com/v1",
			api: "openai-completions",
			modelIds: [],
		});
	});

	it("updates only the selected provider's models and retains matching metadata", async () => {
		const modelsPath = await temporaryModelsPath();
		await writeFile(
			modelsPath,
			`${JSON.stringify({
				providers: {
					acme: {
						name: "Acme",
						baseUrl: "https://acme.example.com/v1",
						api: "openai-completions",
						headers: { "x-route": "coding" },
						models: [{ id: "keep", contextWindow: 200000 }, { id: "remove" }],
					},
					other: { custom: true },
				},
			}, null, 2)}\n`,
			"utf8",
		);

		const result = await writeProviderModels(modelsPath, "acme", ["keep", "new"]);
		const updated = JSON.parse(await readFile(modelsPath, "utf8"));
		expect(result.backupPath).toBeDefined();
		expect(updated.providers.acme.headers).toEqual({ "x-route": "coding" });
		expect(updated.providers.acme.models).toEqual([{ id: "keep", contextWindow: 200000 }, { id: "new" }]);
		expect(updated.providers.other).toEqual({ custom: true });
	});

	it("leaves invalid existing configuration untouched", async () => {
		const modelsPath = await temporaryModelsPath();
		await writeFile(modelsPath, "{ invalid", "utf8");

		await expect(
			writeProvider(modelsPath, {
				providerId: "valid",
				displayName: "Valid",
				baseUrl: "https://example.com/v1",
				api: "google-generative-ai",
				modelIds: ["model"],
			}),
		).rejects.toThrow("Cannot parse");
		expect(await readFile(modelsPath, "utf8")).toBe("{ invalid");
	});
});

describe("input validation", () => {
	it("accepts stable provider ids and rejects ambiguous ones", () => {
		expect(validateProviderId("relay.acme_1")).toBeUndefined();
		expect(validateProviderId("Acme Relay")).toMatch(/lowercase/);
	});

	it("accepts only credential-free HTTP(S) base URLs", () => {
		expect(validateBaseUrl("https://relay.example.com/v1")).toBeUndefined();
		expect(validateBaseUrl("file:///tmp/socket")).toMatch(/http/);
		expect(validateBaseUrl("https://user:secret@example.com/v1")).toMatch(/credentials/);
	});

	it("normalizes comma-separated model ids", () => {
		expect(parseModelIds("alpha, beta,alpha, , gamma/model")).toEqual(["alpha", "beta", "gamma/model"]);
	});
});
