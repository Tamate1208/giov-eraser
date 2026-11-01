import React, { useState } from 'react'
import { Eraser, Download, FileUp, ShieldCheck, RefreshCw, Layers, Scale, X, Printer, CheckCircle2, Save, Minimize2, Sparkles } from 'lucide-react'
import { HubSignatureInfo, CompactLevel } from '../utils/mupdfService'

function formatBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

interface HeaderProps {
  fileName: string | null;
  fileSize?: number | null;
  totalRedactions: number;
  totalDrawings?: number;
  isProcessing: boolean;
  isDeskOpen?: boolean;
  deskItemCount?: number;
  hubSignature?: HubSignatureInfo | null;
  onUploadClick: () => void;
  onSaveClick: () => void;
  onSaveDraftClick?: () => void;
  onCompactClick?: (
    level: CompactLevel,
    action: 'apply' | 'download'
  ) => Promise<{ originalSize: number; compactedSize: number; optimizedImagesCount: number } | null>;
  onPrintClick?: () => void;
  onResetClick: () => void;
  onToggleDesk?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  fileName,
  fileSize,
  totalRedactions,
  totalDrawings = 0,
  isProcessing,
  isDeskOpen = false,
  deskItemCount = 0,
  hubSignature,
  onUploadClick,
  onSaveClick,
  onSaveDraftClick,
  onCompactClick,
  onPrintClick,
  onResetClick,
  onToggleDesk,
}) => {
  const [isLicenseOpen, setIsLicenseOpen] = useState(false)
  const [isCompactOpen, setIsCompactOpen] = useState(false)
  const [compactLevel, setCompactLevel] = useState<CompactLevel>('standard')
  const [lastCompactResult, setLastCompactResult] = useState<{
    originalSize: number;
    compactedSize: number;
    optimizedImagesCount: number;
  } | null>(null)
  const totalCount = totalRedactions + totalDrawings
  const saveBtnLabel = isProcessing
    ? '処理中...'
    : totalRedactions > 0 && totalDrawings > 0
    ? '確定保存 (墨消し・校正)'
    : totalDrawings > 0
    ? '確定保存 (校正済)'
    : '確定保存 (完全墨消し)'
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
      {/* ロゴとアプリ名 */}
      <div className="flex items-center gap-3.5">
        <div className="p-2.5 bg-gradient-to-br from-blue-600 via-indigo-600 to-rose-500 rounded-xl text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/20">
          <Layers className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              GioV PDF Hub
            </h1>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5" />
              完全不可逆・真のRedaction
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
              校正・計測・編纂デスク統合
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
            {fileName ? (
              <>
                <span className="text-blue-300 font-medium truncate inline-block max-w-[320px]">
                  {fileName}
                </span>
                {fileSize && fileSize > 0 && (
                  <span className="px-1.5 py-0.2 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-300 font-mono">
                    {formatBytes(fileSize)}
                  </span>
                )}
                {hubSignature && (
                  <span
                    onClick={() => setIsLicenseOpen(true)}
                    className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-emerald-950/80 border border-emerald-500/40 text-[10px] text-emerald-300 font-mono cursor-pointer hover:bg-emerald-900/80 transition"
                    title={`GioV PDF Hub 出力検証済 (${new Date(hubSignature.timestamp).toLocaleString('ja-JP')} / ${hubSignature.operation})`}
                  >
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Hub Verified</span>
                  </span>
                )}
              </>
            ) : (
              '墨消し・校正描画・寸法計測・資料編纂を完全ローカル完結で統合した高機能PDFワークスペース'
            )}
          </p>
        </div>
      </div>

      {/* 右側アクションボタン */}
      <div className="flex items-center gap-2.5">
        {fileName && (
          <>
            <div className="text-right mr-1.5 hidden xl:block">
              <span className="text-xs text-slate-400">
                {totalRedactions > 0 && totalDrawings > 0
                  ? '消しゴム ＋ 描画'
                  : totalDrawings > 0
                  ? '設定中の描画'
                  : '設定中の消しゴム'}
              </span>
              <div className="text-sm font-bold text-rose-400">
                {totalCount} <span className="text-xs font-normal text-slate-400">箇所</span>
              </div>
            </div>

            <button
              onClick={onResetClick}
              disabled={isProcessing}
              className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 active:scale-95 disabled:opacity-50 cursor-pointer"
              title="最初からやり直す"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">リセット</span>
            </button>
          </>
        )}

        {onToggleDesk && (
          <button
            onClick={onToggleDesk}
            className={`px-3 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border active:scale-95 cursor-pointer shadow-sm ${
              isDeskOpen
                ? 'bg-blue-600 hover:bg-blue-500 text-white border-blue-400 ring-2 ring-blue-400/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="作業机（複数PDFの束ね・編纂デスク）を開閉"
          >
            <Layers className={`w-4 h-4 ${isDeskOpen ? 'text-white' : 'text-blue-400'}`} />
            <span>作業机</span>
            {deskItemCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                isDeskOpen ? 'bg-white text-blue-700' : 'bg-blue-600 text-white'
              }`}>
                {deskItemCount}
              </span>
            )}
          </button>
        )}

        <button
          onClick={onUploadClick}
          disabled={isProcessing}
          className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 active:scale-95 shadow-sm cursor-pointer"
        >
          <FileUp className="w-4 h-4 text-slate-300" />
          <span>{fileName ? '別のPDFを開く' : 'PDFファイルを開く'}</span>
        </button>

        {fileName && onCompactClick && (
          <button
            onClick={() => {
              setLastCompactResult(null)
              setIsCompactOpen(true)
            }}
            disabled={isProcessing}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition flex items-center gap-1.5 border border-amber-500/40 active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
            title="テキスト選択・ベクター図面を100%維持したまま、PDF内部の画像データと不要ストリームを圧縮してファイルサイズを軽量化します"
          >
            <Minimize2 className="w-4 h-4 text-amber-400" />
            <span>軽量化</span>
          </button>
        )}

        {fileName && onPrintClick && (
          <button
            onClick={onPrintClick}
            disabled={isProcessing}
            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700 active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
            title="現在の編集内容（墨消し・校正・回転）を反映して直接プリンターで印刷します"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>印刷</span>
          </button>
        )}

        {fileName && onSaveDraftClick && (
          <button
            onClick={onSaveDraftClick}
            disabled={isProcessing}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 border active:scale-95 shadow-sm cursor-pointer disabled:opacity-50 ${
              totalCount > 0
                ? 'bg-indigo-950/90 hover:bg-indigo-900 text-indigo-200 border-indigo-500/60 ring-1 ring-indigo-400/30'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
            title="物理切除を行わずに一時保存します。一般のPDFビューアでも編集内容が表示され、後からこのアプリで開くとすべての墨消し枠・注記・図形を再編集できます"
          >
            <Save className="w-4 h-4 text-indigo-400" />
            <span>一時保存 (再編集可)</span>
          </button>
        )}

        {fileName && (
          <button
            onClick={onSaveClick}
            disabled={isProcessing}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shadow-lg active:scale-95 ${
              totalCount > 0
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-600/30 ring-1 ring-rose-400/50 cursor-pointer'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer'
            }`}
            title={totalCount === 0 ? '消しゴム枠または描画アイテムを設定してから保存してください' : '指定箇所のテキスト・画像を物理切除して確定保存します（不可逆）'}
          >
            <Download className={`w-4 h-4 ${isProcessing ? 'animate-bounce' : ''}`} />
            <span>{saveBtnLabel}</span>
          </button>
        )}

        <button
          onClick={() => setIsLicenseOpen(true)}
          className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700/80 transition cursor-pointer"
          title="オープンソースライセンス・著作権情報 (AGPL-3.0)"
        >
          <Scale className="w-4 h-4" />
        </button>
      </div>

      {/* PDF軽量化（コンパクト保存）モーダル */}
      {isCompactOpen && onCompactClick && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => !isProcessing && setIsCompactOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Minimize2 className="w-5 h-5 text-amber-400" />
                <h2 className="text-base font-bold text-white">
                  PDF軽量化・コンパクト保存（テキスト選択100%維持）
                </h2>
              </div>
              <button
                onClick={() => setIsCompactOpen(false)}
                disabled={isProcessing}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3">
              <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-500/30 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <span className="font-bold text-blue-200">テキスト・ベクター図面は無劣化で保持：</span>
                  ページ全体を画像化するのではなく、PDF内の<strong>埋め込み画像（XObject）と不要な構造ゴミだけをピンポイント圧縮</strong>するため、軽量化後も<strong>文字の選択・コピー・検索は100%そのまま可能</strong>です。
                </div>
              </div>

              {fileSize && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
                  <span className="text-slate-400">現在のファイルサイズ:</span>
                  <span className="font-mono font-bold text-sm text-white">
                    {formatBytes(fileSize)}
                  </span>
                </div>
              )}

              <div className="space-y-2">
                <div className="font-semibold text-slate-200">圧縮レベルの選択:</div>

                <label
                  onClick={() => setCompactLevel('standard')}
                  className={`block p-3 rounded-xl border cursor-pointer transition ${
                    compactLevel === 'standard'
                      ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                      : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={compactLevel === 'standard'}
                        onChange={() => setCompactLevel('standard')}
                        className="accent-amber-400"
                      />
                      標準（推奨：画質とサイズの最適バランス）
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-semibold">
                      おすすめ
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-5">
                    テキスト・線画は100%無劣化。埋め込み写真・画像のみ長辺最大 1600px / JPEG品質 75% に最適化し、未参照ゴミデータを完全除去します。
                  </p>
                </label>

                <label
                  onClick={() => setCompactLevel('high')}
                  className={`block p-3 rounded-xl border cursor-pointer transition ${
                    compactLevel === 'high'
                      ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                      : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={compactLevel === 'high'}
                        onChange={() => setCompactLevel('high')}
                        className="accent-amber-400"
                      />
                      高圧縮（メール添付・容量制限対策）
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold">
                      最小サイズ
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-5">
                    テキスト・線画は100%無劣化。埋め込み写真・画像を長辺最大 1200px / JPEG品質 55% に高圧縮し、ファイルサイズを劇的に削減します。
                  </p>
                </label>

                <label
                  onClick={() => setCompactLevel('lossless')}
                  className={`block p-3 rounded-xl border cursor-pointer transition ${
                    compactLevel === 'lossless'
                      ? 'bg-amber-500/10 border-amber-500/60 ring-1 ring-amber-400/30'
                      : 'bg-slate-800/40 border-slate-700/70 hover:bg-slate-800/70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <input
                        type="radio"
                        checked={compactLevel === 'lossless'}
                        onChange={() => setCompactLevel('lossless')}
                        className="accent-amber-400"
                      />
                      ロスレス（画像も無劣化・構造クリーンアップのみ）
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-semibold">
                      完全無劣化
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 pl-5">
                    画像の画質も一切変更せず、PDF内部に残った不要データ・重複オブジェクトの掃除とストリーム圧縮のみを行います。
                  </p>
                </label>
              </div>

              {lastCompactResult && (
                <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center justify-between">
                    <span>
                      ✨ 軽量化結果:{' '}
                      {formatBytes(lastCompactResult.originalSize)} →{' '}
                      {formatBytes(lastCompactResult.compactedSize)}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-mono text-xs">
                      {lastCompactResult.compactedSize < lastCompactResult.originalSize
                        ? `▲ ${Math.round(
                            ((lastCompactResult.originalSize - lastCompactResult.compactedSize) /
                              lastCompactResult.originalSize) *
                              100
                          )}% 削減`
                        : '最適化済'}
                    </span>
                  </div>
                  <div className="text-[11px] text-emerald-300/80">
                    ・最適化された埋め込み画像: {lastCompactResult.optimizedImagesCount} 件 ／ テキスト選択100%維持
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-3 border-t border-slate-800">
              <button
                onClick={async () => {
                  const res = await onCompactClick(compactLevel, 'apply')
                  if (res) setLastCompactResult(res)
                }}
                disabled={isProcessing}
                className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 border border-amber-500/40 text-xs font-bold transition cursor-pointer disabled:opacity-50"
                title="現在開いている作業用PDFデータを軽量化し、編集をそのまま続けます"
              >
                ✨ 作業画面のデータに反映
              </button>
              <button
                onClick={async () => {
                  const res = await onCompactClick(compactLevel, 'download')
                  if (res) setLastCompactResult(res)
                }}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-amber-500/20 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>軽量化PDFをファイル保存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ライセンス＆著作権情報モーダル (AGPL-3.0 / OSS 準拠表記) */}
      {isLicenseOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setIsLicenseOpen(false)}
        >
          <div
            className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-6 shadow-2xl text-slate-200 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Scale className="w-5 h-5 text-blue-400" />
                <h2 className="text-base font-bold text-white">
                  ライセンス・著作権情報 (Open Source Notices)
                </h2>
              </div>
              <button
                onClick={() => setIsLicenseOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs leading-relaxed text-slate-300 space-y-3 max-h-[65vh] overflow-y-auto pr-1">
              {hubSignature && (
                <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 space-y-1">
                  <div className="font-bold text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>出力証明（ステルス刻印）検証結果：本アプリ出力ファイル</span>
                  </div>
                  <div className="text-[11px] text-emerald-300/90 font-mono pl-5 space-y-0.5">
                    <div>・出力日時: {new Date(hubSignature.timestamp).toLocaleString('ja-JP')}</div>
                    <div>・処理種別: {hubSignature.operation}</div>
                    <div>・エンジン: GioV PDF Hub v{hubSignature.version}</div>
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                <div className="font-bold text-white mb-1">
                  GioV PDF Hub — Open Source Edition
                </div>
                <p className="text-slate-400">
                  本アプリケーションは、端末内（ブラウザ内のWebAssembly）のみで完全ローカル動作するオープンソースソフトウェアであり、<strong>GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)</strong> の下で提供されています。入力されたPDFデータが外部サーバーへ送信されることは一切ありません。
                </p>
              </div>

              <div className="space-y-2">
                <div className="font-semibold text-slate-200">
                  同梱・使用しているオープンソースライブラリ:
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>MuPDF (mupdf.js)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 font-mono">
                      AGPL-3.0-or-later
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (C) 2006-2026 Artifex Software, Inc.<br />
                    This program is free software: you can redistribute it and/or modify it under the terms of the GNU Affero General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>React / React DOM</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      MIT License
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (c) Meta Platforms, Inc. and affiliates.
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>Lucide Icons (lucide-react)</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      ISC License
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (c) Cole Bemis and Lucide Contributors.
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/60">
                  <div className="flex items-center justify-between font-semibold text-white">
                    <span>Tailwind CSS</span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      MIT License
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Copyright (c) Tailwind Labs, Inc.
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <button
                onClick={() => setIsLicenseOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
