# Pi DIY Provider

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | 日本語 | [한국어](README.ko.md)

JSON を手作業で編集せずに、API キー方式のリレーサービスやカスタムプロバイダーを Pi に設定するためのパッケージです。プロバイダーとモデルの定義を `~/.pi/agent/models.json` に書き込み、Pi のモデルレジストリを更新して、拡張機能のランタイムを安全に再読み込みします。

## インストール

ローカルのチェックアウトからインストールする場合：

```bash
pi install /absolute/path/to/pi-diy-provider
```

1 セッションだけ試す場合：

```bash
pi -e /absolute/path/to/pi-diy-provider
```

## 使い方

`/provider-add` を実行し、次の項目を入力します。

- 安定した小文字のプロバイダー ID
- 表示名
- HTTP(S) の Base URL
- API タイプ（デフォルトは OpenAI Chat Completions。OpenAI Responses、Anthropic Messages、Google Generative AI にも対応）
- ログイン後にモデルを自動検出するか、モデル ID を手動入力するか

推奨する自動検出の手順は次のとおりです。

```text
/provider-add
/login <provider-id>
/provider-model-sync <provider-id>
```

`/provider-model-sync` は、Pi の認証情報ストアから API キーを取得し、プロバイダーのモデルカタログ用エンドポイントに問い合わせます。検出されたモデル ID は、カンマ区切りの一覧としてエディターに表示され、保存前に確認できます。一覧を確定すると `models.json` が更新され、Pi が再読み込みされて、認証済みのモデルを `/model` から利用できるようになります。

自動検出では、OpenAI／Anthropic 形式の `{ "data": [...] }` と、Google 形式の `{ "models": [...] }` に対応しています。保存済みのキーは選択した API に適した認証方式で送信され、リクエストは 20 秒でタイムアウトします。リレーサービス側には互換性のあるモデル一覧エンドポイントが必要です。提供されていない場合は、`/provider-add` をもう一度実行し、モデルの手動入力を選択してください。

この拡張機能は、`models.json` 内の無関係な設定を保持します。既存ファイルを変更する前に、`models.json.backup-20260905T010203004Z` のようなタイムスタンプ付きバックアップを同じディレクトリに作成し、その後ファイルをアトミックに置き換えます。既存の JSON コメントも読み込めますが、書き直されたファイルは標準 JSON として整形されます。元のテキストはバックアップにそのまま残ります。

API キーが `models.json` に書き込まれることはありません。モデルを手動入力した場合は、次を実行してください。

```text
/login <provider-id>
```

プロバイダーは Pi 標準の API キープロバイダー一覧に表示されます。キーを Pi の認証情報ストアに保存すると、手動設定したモデルが `/model` で利用可能になります。自動検出モードの場合は、`/provider-model-sync` で空ではないモデル一覧を保存した後に表示されます。このパッケージが `/provider-add` と `/provider-model-sync` を別々のコマンドとして提供しているのは、Pi の拡張 API に、任意の設定操作を標準の `/login` メニューへ追加する公式な方法が用意されていないためです。

## 開発

Node.js 22.19 以降が必要です。

```bash
npm install --ignore-scripts
npm run check
```
