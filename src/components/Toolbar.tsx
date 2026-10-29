import React, { useState } from 'react'
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Search,
  Trash2,
  Square,
  Sparkles,
} from 'lucide-react'

interface ToolbarProps {
  currentPage: number;
  numPages: number;
  zoom: number;
  colorMode: 'black' | 'white';
  pageRedactionCount: number;
  onPageChange: (newPage: number) => void;
  onZoomChange: (newZoom: number) => void;
  onColorModeChange: (mode: 'black' | 'white') => void;
  onClearPageRedactions: () => void;
  onKeywordSearch: (keyword: string, searchAllPages: boolean) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentPage,
  numPages,
  zoom,
  colorMode,
  pageRedactionCount,
  onPageChange,
  onZoomChange,
  onColorModeChange,
  onClearPageRedactions,
  onKeywordSearch,
}) => {
  const [keyword, setKeyword] = useState('')
  const [isSearching, setIsSearching] = useState(false)

  const handleSearchCurrent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyword.trim()) return
    setIsSearching(true)
    await onKeywordSearch(keyword.trim(), false)
    setIsSearching(false)
  }

  const handleSearchAll = async () => {
    if (!keyword.trim()) return
    setIsSearching(true)
    await onKeywordSearch(keyword.trim(), true)
    setIsSearching(false)
  }

  return (
    <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-xs select-none">
      {/* ページ送り */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 0}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 transition"
          title="前のページ"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <span className="font-medium text-slate-300 flex items-center gap-1.5 px-2">
          ページ
          <input
            type="number"
            min={1}
            max={numPages}
            value={currentPage + 1}
            onChange={(e) => {
              const val = parseInt(e.target.value, 10)
              if (!isNaN(val) && val >= 1 && val <= numPages) {
                onPageChange(val - 1)
              }
            }}
            className="w-12 text-center bg-slate-800 border border-slate-700 rounded px-1.5 py-0.5 text-white font-bold focus:border-rose-500 focus:outline-none"
          />
          / {numPages}
        </span>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= numPages - 1}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 transition"
          title="次のページ"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ズーム */}
      <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
        <button
          onClick={() => onZoomChange(Math.max(0.5, zoom - 0.2))}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          title="縮小"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="font-semibold text-slate-300 min-w-[48px] text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => onZoomChange(Math.min(2.5, zoom + 0.2))}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
          title="拡大"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => onZoomChange(1.0)}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-400 font-medium"
        >
          100%
        </button>
      </div>

      {/* 消しゴムカラーモード（黒塗り / 白塗り） */}
      <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
        <span className="text-slate-400">消しゴムの色:</span>
        <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
          <button
            onClick={() => onColorModeChange('black')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              colorMode === 'black'
                ? 'bg-black text-white shadow-sm ring-1 ring-white/20'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Square className="w-3.5 h-3.5 fill-black stroke-slate-400" />
            黒塗り（墨消し）
          </button>
          <button
            onClick={() => onColorModeChange('white')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition ${
              colorMode === 'white'
                ? 'bg-white text-slate-900 shadow-sm font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Square className="w-3.5 h-3.5 fill-white stroke-slate-300" />
            白塗り（余白化）
          </button>
        </div>
      </div>

      {/* キーワード一括消しゴム検索 */}
      <form onSubmit={handleSearchCurrent} className="flex items-center gap-2 border-l border-slate-800 pl-4 flex-1 max-w-md">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="消したいキーワード（氏名・会社名等）"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:border-rose-500 focus:outline-none"
          />
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
        </div>
        <button
          type="submit"
          disabled={!keyword.trim() || isSearching}
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium transition flex items-center gap-1 border border-slate-700"
          title="このページで見つかった箇所を墨消し指定"
        >
          <Sparkles className="w-3 h-3 text-rose-400" />
          現ページ
        </button>
        <button
          type="button"
          onClick={handleSearchAll}
          disabled={!keyword.trim() || isSearching}
          className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/60 disabled:opacity-40 text-rose-300 text-xs font-medium transition flex items-center gap-1"
          title="全ページで一致する箇所をすべて一括墨消し指定"
        >
          全頁一括
        </button>
      </form>

      {/* 現在ページの消しゴム削除 */}
      {pageRedactionCount > 0 && (
        <button
          onClick={onClearPageRedactions}
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/40 text-rose-400 border border-slate-700 hover:border-rose-800/60 text-xs transition flex items-center gap-1.5 ml-auto"
          title="このページの消しゴム枠をすべて解除"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>この頁をクリア ({pageRedactionCount})</span>
        </button>
      )}
    </div>
  )
}
