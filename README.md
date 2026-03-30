# pdftodraft

PDF ファイル名とマスタ設定を突き合わせて、メール下書き用の EML を ZIP で生成するツールです。
フロントエンドは React + Vite、バックエンドは FastAPI + SQLite で構成されています。

## できること

- PDF をアップロードして、ファイル名キーワードから送付先候補を自動判定
- CSV で送付先マスタをインポート、一覧編集、テンプレート CSV ダウンロード
- レイアウトごとに送信元アドレスを設定
- メール本文テンプレートを使って EML 下書きを一括生成
- 生成前に宛先、件名、本文を画面上で一時編集

## 技術スタック

- Frontend: React 18, Vite, Tailwind CSS, Radix UI, Axios
- Backend: FastAPI, Uvicorn, SQLAlchemy, Pandas, Jinja2
- Database: SQLite

## ディレクトリ概要

- src: フロントエンド本体
- backend: FastAPI アプリ、API、DB モデル
- sample: サンプル CSV
- pdftodraft.db: ローカル SQLite DB

## ローカル起動手順

### 1. Frontend 依存関係のインストール

初回のみ実行します。

```bash
npm install
```

### 2. Python 仮想環境の準備

仮想環境が未作成の場合のみ実行します。

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

既存環境を使う場合は以下だけで構いません。

```bash
source .venv/bin/activate
```

### 3. Backend 起動

```bash
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

起動確認:

```bash
curl http://127.0.0.1:8000/api/info
```

期待値:

```json
{"app":"pdftodraft","version":"1.0.0"}
```

### 4. Frontend 起動

別ターミナルで実行します。

```bash
npm run dev
```

起動後のアクセス先:

- Frontend: http://localhost:5173
- Backend API: http://127.0.0.1:8000

## 開発時の注意

- Vite は /api を http://localhost:8000 にプロキシしています
- SQLite はプロジェクト直下の pdftodraft.db を使用します
- 送信元アドレスは layout_settings テーブルでレイアウト単位に管理します
- CORS は localhost:5173 と 127.0.0.1:5173 を許可しています
- 本番用 static ディレクトリが存在する場合は FastAPI から配信します

## Railway での運用（SQLite の永続化）

コンテナのファイルシステムは**再デプロイや再起動で消える**ことがあります。SQLite をアプリ直下（`./pdftodraft.db`）だけに置いていると、**マスタデータが毎回空に戻る**可能性があります。

**seikyu_split と同じ運用**: Railway で **Volume のマウント先を `/data`** にすると、アプリ起動時に `/data` を検知し、**自動的に `/data/pdftodraft.db` を使います**。DB のパスは環境変数では指定しません。

### 1. Volume を付ける

1. Railway の対象サービスを開く
2. **Settings → Volumes** で Volume を追加する
3. **Mount Path を `/data`** にする（このプロジェクトの想定どおり）

### 2. 注意点

- Volume を付ける**前**にだけ存在していた `./pdftodraft.db` 上のデータは、Volume 上の新しいファイルには**自動では引き継がれません**。必要なら事前に **CSV エクスポート**で退避してください。
- 重要データは **定期的に CSV でバックアップ**するか、将来的に **PostgreSQL 等のマネージド DB**への移行を検討してください。

## よく使う API

- GET /api/info: 動作確認
- GET /api/layouts: レイアウト一覧取得
- GET /api/layout-settings/{layout_name}: レイアウト設定取得
- PUT /api/layout-settings/{layout_name}: レイアウト設定更新
- GET /api/configs: マスタ一覧取得
- PUT /api/configs/{config_id}: マスタ更新
- DELETE /api/configs/{config_id}: マスタ削除
- POST /api/import-csv: マスタ CSV 取り込み
- GET /api/template-csv: テンプレート CSV ダウンロード
- POST /api/analyze-pdfs: PDF と設定の突き合わせ確認
- POST /api/generate-drafts: EML ZIP 生成

## トラブルシュート

### port 8000 is already in use が出る場合

古い Python プロセスが 8000 番を掴んだまま残ることがあります。以下で確認して停止してください。

```bash
lsof -nP -iTCP:8000
ps -p <PID> -o pid,ppid,command
kill <PID>
```

特に Uvicorn の reload 起動後にソケットだけ残るケースがありました。ローカル運用ではまず reload なし起動を推奨します。

### Pydantic の orm_mode 警告が出る場合

現状は警告のみで起動自体には影響しません。将来的には Pydantic v2 に合わせて from_attributes へ置き換えると解消できます。

### EML を開いても送信ボタンが出ない場合

本アプリでは互換性を上げるために以下を付与しています。

- X-Unsent: 1
- Date
- Message-ID
- From
- Reply-To
- MIME-Version

ただし EML を draft として開く挙動はメールクライアント依存です。特に Outlook 系以外では X-Unsent を無視することがあり、その場合は送信ボタンが表示されないことがあります。

## 引き継ぎメモ

- サンプルデータは sample 配下にあります
- .gitignore で sample は除外されています
- 画面から /api/layouts へのアクセスが通れば、フロントとバックの接続確認になります