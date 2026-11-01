# GioV PDF Hub

**GioV PDF Hub** は、PDFドキュメントの「完全不可逆墨消し（真のRedaction）」「朱書き・校正描画」「高精度寸法・面積計測」「画像挿入」、そして複数PDFのページを自在に束ねて再構築する「作業机（編纂デスク）」を1つに統合した、**完全クライアントサイド（端末内完結・ゼロ外部通信）** のオープンソースPDFワークスペースです。

## ✨ 主な機能

1. **完全不可逆・真の墨消し（Redaction）**
   - 指定領域のテキスト・画像データをPDFの内部ストリームから物理的に切除（`applyRedactions` + ガベージコレクション）。
   - テキスト吸着選択、自由矩形選択、キーワード一括検索消去、全ページ一括展開に対応。
   - 消去箇所以外のテキスト選択・OCR構造は100%保持。
2. **校正・描画ツール**
   - テキスト挿入（背景白塗りジャストフィット・マウスホイール等によるサイズ動的変更・任意角度回転対応）
   - 矢印・直線・矩形・円・多角形・チェックマーク
   - 画像挿入（印影・ロゴ・現場写真等のPNG/JPEG配置・リサイズ・回転・PDF直接ベイク）
3. **高精度・図面計測（物差しツール）**
   - 縮尺指定（1:1 〜 任意縮尺）による2点間距離計測（`m` / `mm`）および多角形面積計測（`A＝... m²`）。
4. **作業机（複数PDFの束ね・再編纂デスク）**
   - 現在開いているPDFの選択ページや、外部から追加した複数のPDFファイルを机の上に並べて順序入れ替え・回転・削除し、1つのクリーンなPDFとして結合出力。
   - 左右ペインの幅ドラッグ調整および1〜3列自動レスポンシブグリッド表示。

---

## 🔒 セキュリティとプライバシー設計

- **外部通信ゼロ（100% ローカル処理）**:
  すべてのPDF解析・レンダリング・編集・出力処理はブラウザ内の WebAssembly（MuPDF）と Canvas 上で完結します。外部サーバーやクラウドAPIへのデータ送信は一切行われません。
- **単一HTMLスタンドアロン動作**:
  ビルド成果物（`GioV_PDF_Hub.html` / `dist/index.html`）はすべてのアセットがインライン化されており、オフライン環境（閉域網）でもそのまま動作します。

---

## 🚀 ビルドとデプロイ（Render Static Site 対応）

### ローカル開発・ビルド

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動
npm run dev

# 本番ビルド（dist/index.html および GioV_PDF_Hub.html を生成）
npm run build
```

### Render での公開設定（Static Site）

- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`

---

## 📜 ライセンスと著作権表記 (License & Third-Party Notices)

本ソフトウェア（**GioV PDF Hub**）は、コアエンジンである `mupdf`（GNU Affero General Public License v3.0）とのライセンス整合性に基づき、**GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)** の下でオープンソースソフトウェアとして公開・提供されています。ライセンス全文は同梱の [LICENSE](./LICENSE) ファイルをご参照ください。

### 使用している主なオープンソースライブラリ

| ライブラリ | ライセンス | 著作権者・提供元 |
| :--- | :---: | :--- |
| **[MuPDF (mupdf.js)](https://mupdf.com/)** | **AGPL-3.0-or-later** | Copyright (C) 2006-2026 Artifex Software, Inc. |
| **[React / React DOM](https://react.dev/)** | **MIT** | Copyright (c) Meta Platforms, Inc. and affiliates. |
| **[Lucide Icons (lucide-react)](https://lucide.dev/)** | **ISC** | Copyright (c) Cole Bemis and Lucide Contributors. |
| **[Tailwind CSS](https://tailwindcss.com/)** | **MIT** | Copyright (c) Tailwind Labs, Inc. |
