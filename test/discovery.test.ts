import { describe, expect, it, vi } from "vitest";
import { buildModelsUrl, discoverModels } from "../src/discovery.ts";

describe("model discovery", () => {
	it("builds catalog URLs for each supported API family", () => {
		expect(buildModelsUrl("https://relay.example.com/v1", "openai-completions")).toBe(
			"https://relay.example.com/v1/models",
		);
		expect(buildModelsUrl("https://api.example.com", "anthropic-messages")).toBe(
			"https://api.example.com/v1/models",
		);
		expect(buildModelsUrl("https://generativelanguage.googleapis.com/v1beta", "google-generative-ai")).toBe(
			"https://generativelanguage.googleapis.com/v1beta/models",
		);
	});

	it("parses OpenAI catalogs and sends bearer authentication", async () => {
		const fetcher = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
			expect(String(input)).toBe("https://relay.example.com/v1/models");
			expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-key");
			return new Response(JSON.stringify({ data: [{ id: "zeta" }, { id: "alpha" }, { id: "alpha" }] }));
		});

		await expect(
			discoverModels(
				{ api: "openai-responses", baseUrl: "https://relay.example.com/v1", apiKey: "test-key" },
				fetcher,
			),
		).resolves.toEqual([{ id: "alpha" }, { id: "zeta" }]);
	});

	it("parses Google model names and sends Google authentication", async () => {
		const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
			expect(new Headers(init?.headers).get("x-goog-api-key")).toBe("google-key");
			return new Response(
				JSON.stringify({ models: [{ name: "models/gemini-example", displayName: "Gemini Example" }] }),
			);
		});

		await expect(
			discoverModels(
				{ api: "google-generative-ai", baseUrl: "https://google.example.com/v1beta", apiKey: "google-key" },
				fetcher,
			),
		).resolves.toEqual([{ id: "gemini-example", name: "Gemini Example" }]);
	});

	it("reports provider errors without accepting invalid catalog bodies", async () => {
		const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not allowed", { status: 401 }));
		await expect(
			discoverModels(
				{ api: "anthropic-messages", baseUrl: "https://anthropic.example.com", apiKey: "bad" },
				fetcher,
			),
		).rejects.toThrow("401: not allowed");
	});
});
