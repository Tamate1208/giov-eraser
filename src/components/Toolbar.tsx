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
  Loader2,
  FileText,
} from 'lucide-react'

interface ToolbarProps {
  currentPage: number;
  numPages: number;
  zoom: number;
  colorMode: 'black' | 'white';
  selectMode: 'text' | 'rect';
  pageRedactionCount: number;
  totalRedactionCount: number;
  hasLastSelectedArea: boolean;
  onPageChange: (newPage: number) => void;
  onZoomChange: (newZoom: number) => void;
  onColorModeChange: (mode: 'black' | 'white') => void;
  onSelectModeChange: (mode: 'text' | 'rect') => void;
  onClearPageRedactions: () => void;
  onClearAllRedactions: () => void;
  onKeywordSearch: (keyword: string, searchAllPages: boolean) => void;
  onApplyAreaToAllPages: () => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentPage,
  numPages,
  zoom,
  colorMode,
  selectMode,
  pageRedactionCount,
  totalRedactionCount,
  hasLastSelectedArea,
  onPageChange,
  onZoomChange,
  onColorModeChange,
  onSelectModeChange,
  onClearPageRedactions,
  onClearAllRedactions,
  onKeywordSearch,
  onApplyAreaToAllPages,
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
    if (keyword.trim()) {
      setIsSearching(true)
      await onKeywordSearch(keyword.trim(), true)
      setIsSearching(false)
    } else if (hasLastSelectedArea) {
      onApplyAreaToAllPages()
    }
  }

  const isAllBtnDisabled = (!keyword.trim() && !hasLastSelectedArea) || isSearching

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
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              colorMode === 'black'
                ? 'bg-black text-white shadow-sm ring-1 ring-white/20 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Square className="w-3.5 h-3.5 fill-black stroke-slate-400" />
            黒塗り（墨消し）
          </button>
          <button
            onClick={() => onColorModeChange('white')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
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

      {/* 選択モード（テキスト吸着 / 自由矩形） */}
      <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
        <span className="text-slate-400">選択モード:</span>
        <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
          <button
            onClick={() => onSelectModeChange('text')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              selectMode === 'text'
                ? 'bg-rose-600 text-white shadow-sm ring-1 ring-white/20 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="囲んだ範囲の中にある文字だけにピッタリ吸着して消去"
          >
            <FileText className="w-3.5 h-3.5" />
            テキスト吸着
          </button>
          <button
            onClick={() => onSelectModeChange('rect')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer ${
              selectMode === 'rect'
                ? 'bg-rose-600 text-white shadow-sm ring-1 ring-white/20 font-bold'
                : 'text-slate-400 hover:text-white'
            }`}
            title="文字の有無に関わらず、囲んだ四角形全体をそのまま消去（図面・印鑑等）"
          >
            <Square className="w-3.5 h-3.5" />
            自由矩形
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
          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-medium transition flex items-center gap-1 border border-slate-700 cursor-pointer"
          title="このページで見つかったキーワードを墨消し指定"
        >
          {isSearching ? (
            <Loader2 className="w-3 h-3 text-rose-400 animate-spin" />
          ) : (
            <Sparkles className="w-3 h-3 text-rose-400" />
          )}
          現ページ
        </button>
        <button
          type="button"
          onClick={handleSearchAll}
          disabled={isAllBtnDisabled}
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
            isAllBtnDisabled
              ? 'opacity-40 bg-slate-800 border-slate-700 text-slate-400 cursor-not-allowed'
              : !keyword.trim() && hasLastSelectedArea
              ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 shadow-md shadow-rose-600/30 ring-1 ring-white/30 animate-pulse'
              : 'bg-rose-950/70 hover:bg-rose-900 border-rose-800/80 text-rose-300'
          }`}
          title={
            keyword.trim()
              ? '全ページで一致するキーワードを一括墨消し指定'
              : hasLastSelectedArea
              ? '直前にマウスで囲んだ領域を全ページの同じ位置に一括適用'
              : 'キーワードを入力するか、マウスで領域を囲んでください'
          }
        >
          {isSearching ? (
            <Loader2 className="w-3.5 h-3.5 text-rose-300 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5 text-rose-300" />
          )}
          <span>
            {!keyword.trim() && hasLastSelectedArea ? '囲み領域を全頁一括' : '全頁一括'}
          </span>
        </button>
      </form>

      {/* 消しゴム枠クリアボタンエリア */}
      <div className="flex items-center gap-2 ml-auto">
        {pageRedactionCount > 0 && (
          <button
            onClick={onClearPageRedactions}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition flex items-center gap-1.5 cursor-pointer"
            title="このページの消しゴム枠をすべて解除"
          >
            <Trash2 className="w-3.5 h-3.5 text-slate-400" />
            <span>この頁をクリア ({pageRedactionCount})</span>
          </button>
        )}

        {totalRedactionCount > 0 && (
          <button
            onClick={onClearAllRedactions}
            className="px-2.5 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/80 text-xs font-medium transition flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
            title="全ページの消しゴム枠をすべて一括解除"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>全頁クリア (計{totalRedactionCount})</span>
          </button>
        )}
      </div>
    </div>
  )
}
