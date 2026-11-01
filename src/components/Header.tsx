import React, { useState } from 'react'
import { Eraser, Download, FileUp, ShieldCheck, RefreshCw, Layers, Scale, X, Printer, CheckCircle2 } from 'lucide-react'
import { HubSignatureInfo } from '../utils/mupdfService'

interface HeaderProps {
  fileName: string | null;
  totalRedactions: number;
  totalDrawings?: number;
  isProcessing: boolean;
  isDeskOpen?: boolean;
  deskItemCount?: number;
  hubSignature?: HubSignatureInfo | null;
  onUploadClick: () => void;
  onSaveClick: () => void;
  onPrintClick?: () => void;
  onResetClick: () => void;
  onToggleDesk?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  fileName,
  totalRedactions,
  totalDrawings = 0,
  isProcessing,
  isDeskOpen = false,
  deskItemCount = 0,
  hubSignature,
  onUploadClick,
  onSaveClick,
  onPrintClick,
  onResetClick,
  onToggleDesk,
}) => {
  const [isLicenseOpen, setIsLicenseOpen] = useState(false)
  const totalCount = totalRedactions + totalDrawings
  const saveBtnLabel = isProcessing
    ? '処理中...'
    : totalRedactions > 0 && totalDrawings > 0
    ? '墨消し＆校正PDFを保存'
    : totalDrawings > 0
    ? '校正済PDFを保存'
    : '墨消しPDFを保存'
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
                <span className="text-blue-300 font-medium truncate inline-block max-w-[360px]">
                  {fileName}
                </span>
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
      <div className="flex items-center gap-3">
        {fileName && (
          <>
            <div className="text-right mr-2 hidden sm:block">
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
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 active:scale-95 disabled:opacity-50"
              title="最初からやり直す"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden md:inline">リセット</span>
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
          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 active:scale-95 shadow-sm"
        >
          <FileUp className="w-4 h-4 text-slate-300" />
          <span>{fileName ? '別のPDFを開く' : 'PDFファイルを開く'}</span>
        </button>

        {fileName && onPrintClick && (
          <button
            onClick={onPrintClick}
            disabled={isProcessing}
            className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition flex items-center gap-1.5 border border-slate-700 active:scale-95 shadow-sm cursor-pointer disabled:opacity-50"
            title="現在の編集内容（墨消し・校正・回転）を反映して直接プリンターで印刷します"
          >
            <Printer className="w-4 h-4 text-blue-400" />
            <span>印刷</span>
          </button>
        )}

        {fileName && (
          <button
            onClick={onSaveClick}
            disabled={isProcessing}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg active:scale-95 ${
              totalCount > 0
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-600/30 ring-1 ring-rose-400/50 cursor-pointer'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 cursor-pointer'
            }`}
            title={totalCount === 0 ? '消しゴム枠または描画アイテムを設定してから保存してください' : 'PDFを保存'}
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
