import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { writeProvider } from "../src/config.ts";
import { createProviderManagerExtension } from "../src/index.ts";

type CommandHandler = (args: string, ctx: ExtensionCommandContext) => Promise<void>;

function registerExtension(modelsPath: string, fetcher: typeof fetch = fetch): Map<string, CommandHandler> {
	const handlers = new Map<string, CommandHandler>();
	const pi = {
		registerCommand(name: string, options: { handler: CommandHandler }) {
			handlers.set(name, options.handler);
		},
	} as unknown as ExtensionAPI;
	createProviderManagerExtension({ modelsPath, fetcher })(pi);
	return handlers;
}

describe("provider commands", () => {
	it("runs the manual wizard, refreshes models, and reloads the runtime", async () => {
		const directory = await mkdtemp(join(tmpdir(), "pi-diy-provider-extension-"));
		const modelsPath = join(directory, "models.json");
		const handlers = registerExtension(modelsPath);
		const input = vi
			.fn()
			.mockResolvedValueOnce("acme")
			.mockResolvedValueOnce("Acme Relay")
			.mockResolvedValueOnce("https://relay.example.com/v1")
			.mockResolvedValueOnce("alpha, beta");
		const notify = vi.fn();
		const refresh = vi.fn().mockResolvedValue({ aborted: false, errors: new Map() });
		const reload = vi.fn().mockResolvedValue(undefined);
		const ctx = {
			hasUI: true,
			ui: {
				input,
				select: vi
					.fn()
					.mockResolvedValueOnce("OpenAI Chat Completions (default)")
					.mockResolvedValueOnce("Enter model ids manually"),
				confirm: vi.fn().mockResolvedValue(true),
				notify,
			},
			modelRegistry: {
				refresh,
				getProvider: vi.fn().mockReturnValue({ id: "acme" }),
				getAll: vi.fn().mockReturnValue([
					{ provider: "acme", id: "alpha" },
					{ provider: "acme", id: "beta" },
				]),
			},
			reload,
		} as unknown as ExtensionCommandContext;

		await handlers.get("provider-add")!("", ctx);

		expect(refresh).toHaveBeenCalledWith({ allowNetwork: false, providers: ["acme"] });
		expect(reload).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("/login acme"), "info");
		expect(await readFile(modelsPath, "utf8")).not.toContain("apiKey");
	});

	it("discovers models with stored auth and saves the edited selection", async () => {
		const directory = await mkdtemp(join(tmpdir(), "pi-diy-provider-sync-"));
		const modelsPath = join(directory, "models.json");
		await writeProvider(modelsPath, {
			providerId: "acme",
			displayName: "Acme Relay",
			baseUrl: "https://relay.example.com/v1",
			api: "openai-completions",
			modelIds: [],
			allowEmptyModels: true,
		});
		const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_input, init) => {
			expect(new Headers(init?.headers).get("authorization")).toBe("Bearer secret");
			return new Response(JSON.stringify({ data: [{ id: "alpha" }, { id: "beta" }] }), { status: 200 });
		});
		const handlers = registerExtension(modelsPath, fetcher);
		const notify = vi.fn();
		const refresh = vi.fn().mockResolvedValue({ aborted: false, errors: new Map() });
		const reload = vi.fn().mockResolvedValue(undefined);
		const ctx = {
			hasUI: true,
			ui: {
				editor: vi.fn().mockResolvedValue("alpha, beta"),
				confirm: vi.fn().mockResolvedValue(true),
				notify,
			},
			modelRegistry: {
				refresh,
				getProvider: vi.fn().mockReturnValue({ id: "acme" }),
				getAll: vi.fn().mockReturnValue([
					{ provider: "acme", id: "alpha" },
					{ provider: "acme", id: "beta" },
				]),
				getProviderAuth: vi.fn().mockResolvedValue({ auth: { apiKey: "secret" } }),
			},
			reload,
		} as unknown as ExtensionCommandContext;

		await handlers.get("provider-model-sync")!("acme", ctx);

		expect(fetcher).toHaveBeenCalledOnce();
		expect(reload).toHaveBeenCalledOnce();
		expect(notify).toHaveBeenCalledWith(expect.stringContaining("Select one with /model"), "info");
		const saved = JSON.parse(await readFile(modelsPath, "utf8"));
		expect(saved.providers.acme.models).toEqual([{ id: "alpha" }, { id: "beta" }]);
		expect(await readFile(modelsPath, "utf8")).not.toContain("secret");
	});
});
