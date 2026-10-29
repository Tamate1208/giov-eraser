import React from 'react'
import { Eraser, Download, FileUp, ShieldCheck, RefreshCw } from 'lucide-react'

interface HeaderProps {
  fileName: string | null;
  totalRedactions: number;
  isProcessing: boolean;
  onUploadClick: () => void;
  onSaveClick: () => void;
  onResetClick: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  fileName,
  totalRedactions,
  isProcessing,
  onUploadClick,
  onSaveClick,
  onResetClick,
}) => {
  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
      {/* ロゴとアプリ名 */}
      <div className="flex items-center gap-3.5">
        <div className="p-2.5 bg-gradient-to-br from-rose-500 to-pink-600 rounded-xl text-white shadow-lg shadow-rose-500/25 ring-1 ring-white/20">
          <Eraser className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
              GioV 消しゴム
            </h1>
            <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5" />
              完全不可逆・真のRedaction
            </span>
            <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              OCR・他テキスト完全保持
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {fileName ? (
              <span className="text-rose-300 font-medium truncate inline-block max-w-[360px]">
                {fileName}
              </span>
            ) : (
              'PDF内部のテキスト・画像を物理削除し、消去場所以外のテキスト選択・OCR適性を100%維持'
            )}
          </p>
        </div>
      </div>

      {/* 右側アクションボタン */}
      <div className="flex items-center gap-3">
        {fileName && (
          <>
            <div className="text-right mr-2 hidden sm:block">
              <span className="text-xs text-slate-400">設定中の消しゴム</span>
              <div className="text-sm font-bold text-rose-400">
                {totalRedactions} <span className="text-xs font-normal text-slate-400">箇所</span>
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

        <button
          onClick={onUploadClick}
          disabled={isProcessing}
          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition flex items-center gap-1.5 border border-slate-700 active:scale-95 shadow-sm"
        >
          <FileUp className="w-4 h-4 text-slate-300" />
          <span>{fileName ? '別のPDFを開く' : 'PDFファイルを開く'}</span>
        </button>

        {fileName && (
          <button
            onClick={onSaveClick}
            disabled={isProcessing || totalRedactions === 0}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 shadow-lg active:scale-95 ${
              totalRedactions > 0
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white shadow-rose-600/30 ring-1 ring-rose-400/50'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <Download className={`w-4 h-4 ${isProcessing ? 'animate-bounce' : ''}`} />
            <span>{isProcessing ? '墨消し処理中...' : '墨消しPDFを保存'}</span>
          </button>
        )}
      </div>
    </header>
  )
}
