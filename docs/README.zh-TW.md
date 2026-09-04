# Pi DIY Provider

[English](../README.md) | [简体中文](README.zh-CN.md) | 繁體中文 | [日本語](README.ja.md) | [한국어](README.ko.md)

一個專為 Pi 設計的擴充套件，用來設定以 API Key 驗證的中轉服務及自訂供應商，無須手動編輯 JSON。它會將供應商與模型定義寫入 `~/.pi/agent/models.json`、重新整理 Pi 的模型登錄檔，並安全地重新載入擴充套件執行環境。

## 安裝

從本機檢出的目錄安裝：

```bash
pi install /absolute/path/to/pi-diy-provider
```

僅在目前工作階段中試用：

```bash
pi -e /absolute/path/to/pi-diy-provider
```

## 使用方式

執行 `/provider-add`，然後依序輸入：

- 一個穩定且使用小寫字母的供應商 ID；
- 顯示名稱；
- HTTP(S) Base URL；
- API 類型（預設為 OpenAI Chat Completions，亦支援 OpenAI Responses、Anthropic Messages 與 Google Generative AI）；
- 登入後自動探索模型，或手動輸入模型 ID。

建議的自動探索流程如下：

```text
/provider-add
/login <provider-id>
/provider-model-sync <provider-id>
```

`/provider-model-sync` 會從 Pi 的憑證儲存區讀取 API Key、請求供應商的模型目錄端點，並在編輯器中開啟自動找到且以逗號分隔的模型 ID，供你檢查。確認清單後，它會更新 `models.json`、重新整理 Pi，並讓已通過驗證的模型出現在 `/model` 中。

自動探索支援 OpenAI 與 Anthropic 風格的 `{ "data": [...] }` 模型目錄，以及 Google 風格的 `{ "models": [...] }` 模型目錄。擴充套件會依所選 API 的驗證方式傳送已儲存的 Key，並在 20 秒後逾時。中轉服務必須提供相容的模型清單端點；若未提供，請重新執行 `/provider-add` 並選擇手動輸入模型。

本擴充套件會保留 `models.json` 中不相關的設定。修改既有檔案前，它會在同一目錄建立帶有時間戳記的備份，例如 `models.json.backup-20260905T010203004Z`，接著以不可分割的方式取代原始檔案。既有的 JSON 註解可以被讀取，但重寫後的檔案會採用標準 JSON 格式；備份則會保留完全相同的原始文字。

API Key 不會寫入 `models.json`。手動輸入模型時，請執行：

```text
/login <provider-id>
```

供應商會顯示在 Pi 內建的 API Key 供應商清單中。Key 儲存至 Pi 的憑證儲存區後，手動設定的模型便會出現在 `/model` 中；使用自動探索模式的供應商，則須先透過 `/provider-model-sync` 儲存非空白的模型清單。本擴充套件刻意將功能分成 `/provider-add` 與 `/provider-model-sync` 兩個指令，因為 Pi 的擴充套件 API 目前並未提供受支援的方法，讓任意設定動作可以加入原生 `/login` 選單。

## 開發

需要 Node.js 22.19 或更新版本。

```bash
npm install --ignore-scripts
npm run check
```
