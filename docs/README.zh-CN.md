# Pi DIY Provider

[English](../README.md) | 简体中文 | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | [한국어](README.ko.md)

一个专注于 Pi 的扩展包，用于配置基于 API Key 的中转服务和自定义供应商，无需手动编辑 JSON。它会将供应商及模型定义写入 `~/.pi/agent/models.json`，刷新 Pi 的模型注册表，并安全地重新加载扩展运行时。

## 安装

从 npm 安装最新版本：

```bash
pi install npm:pi-diy-provider
```

仅在当前会话中试用，不写入设置：

```bash
pi -e npm:pi-diy-provider
```

更新或卸载已安装的扩展包：

```bash
pi update npm:pi-diy-provider
pi remove npm:pi-diy-provider
```

## 使用

运行 `/provider-add`，然后依次输入：

- 一个稳定的、小写的供应商 ID；
- 显示名称；
- HTTP(S) Base URL；
- API 类型（默认为 OpenAI Chat Completions，同时支持 OpenAI Responses、Anthropic Messages 和 Google Generative AI）；
- 登录后自动发现模型，或手动输入模型 ID。

推荐的自动发现流程如下：

```text
/provider-add
/login <provider-id>
/provider-model-sync <provider-id>
```

`/provider-model-sync` 会从 Pi 的凭据存储中读取 API Key，请求供应商的模型目录接口，并在编辑器中打开自动发现的、以逗号分隔的模型 ID，供你检查。确认后，它会更新 `models.json`、刷新 Pi，并让通过身份验证的模型出现在 `/model` 中。

自动发现支持 OpenAI 和 Anthropic 风格的 `{ "data": [...] }` 模型目录，以及 Google 风格的 `{ "models": [...] }` 模型目录。扩展会按照所选 API 的认证方式发送已保存的 Key，并在 20 秒后超时。中转服务必须提供兼容的模型列表接口；如果没有，请重新运行 `/provider-add` 并选择手动输入模型。

本扩展会保留 `models.json` 中无关的配置。修改现有文件前，它会在同一目录创建带时间戳的备份，例如 `models.json.backup-20260905T010203004Z`，随后以原子方式替换原文件。现有 JSON 注释可以被读取，不过文件重写后会采用标准 JSON 格式；备份中会保留原始文本。

API Key 不会写入 `models.json`。手动输入模型时，请运行：

```text
/login <provider-id>
```

供应商会出现在 Pi 内置的 API Key 供应商列表中。Key 保存到 Pi 的凭据存储后，手动配置的模型会出现在 `/model` 中；使用自动发现模式的供应商，则需要先通过 `/provider-model-sync` 保存非空的模型列表。本扩展有意将功能拆分为 `/provider-add` 和 `/provider-model-sync` 两个命令，因为 Pi 的扩展 API 暂未提供受支持的方式，将任意设置操作注入原生 `/login` 菜单。

## 开发

需要 Node.js 22.19 或更高版本。

```bash
git clone https://github.com/chen-985211/pi-diy-provider.git
cd pi-diy-provider
npm install --ignore-scripts
npm run check
```

开发时，仅在当前会话中加载本地检出目录：

```bash
pi -e /absolute/path/to/pi-diy-provider
```

也可以将本地检出目录安装到 Pi：

```bash
pi install /absolute/path/to/pi-diy-provider
```
