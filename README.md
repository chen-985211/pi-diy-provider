# Pi DIY Provider

English | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

A focused Pi package for setting up API-key-based relay and custom providers without editing JSON. It writes provider and model definitions to `~/.pi/agent/models.json`, refreshes Pi's model registry, and safely reloads the extension runtime.

## Install

From this checkout:

```bash
pi install /absolute/path/to/pi-diy-provider
```

For a one-session trial:

```bash
pi -e /absolute/path/to/pi-diy-provider
```

## Use

Run `/provider-add` and enter:

- a stable lowercase provider id;
- a display name;
- an HTTP(S) Base URL;
- an API type (OpenAI Chat Completions is the default; OpenAI Responses, Anthropic Messages, and Google Generative AI are also supported);
- whether to discover models after login or enter model ids manually.

The recommended discovery flow is:

```text
/provider-add
/login <provider-id>
/provider-model-sync <provider-id>
```

`/provider-model-sync` resolves the API key from Pi's credential store, requests the provider's model-catalog endpoint, and opens the discovered comma-separated model ids in an editor for review. Confirming the list updates `models.json`, refreshes Pi, and makes the authenticated models available in `/model`.

Discovery recognizes OpenAI- and Anthropic-style `{ "data": [...] }` catalogs and Google-style `{ "models": [...] }` catalogs. It sends the stored key using the authentication convention for the selected API and times out after 20 seconds. A relay must expose a compatible model-list endpoint; if it does not, rerun `/provider-add` and choose manual model entry.

The extension preserves unrelated `models.json` configuration. Before changing an existing file, it creates a timestamped sibling backup such as `models.json.backup-20260905T010203004Z`, then replaces the original atomically. Existing JSON comments are accepted, although a rewritten file is formatted as standard JSON; the backup retains the exact original text.

No API key is written to `models.json`. When using manual model entry, run:

```text
/login <provider-id>
```

The provider appears in Pi's built-in API-key provider list. After the key is saved in Pi's credential store, manually configured models become available in `/model`; discovery-mode providers appear there after `/provider-model-sync` saves a non-empty model list. This package intentionally adds separate `/provider-add` and `/provider-model-sync` commands; Pi's extension API does not expose a supported way to inject an arbitrary setup action into the native `/login` menu.

## Development

Requires Node.js 22.19 or newer.

```bash
npm install --ignore-scripts
npm run check
```
