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
  Undo2,
  Type,
  ArrowUpRight,
  Minus,
  Hexagon,
  Check,
  Circle,
  Eraser,
  PenTool,
} from 'lucide-react'
import { AppMode, DrawingTool, FillMode } from '../types/drawing'

interface ToolbarProps {
  currentPage: number;
  numPages: number;
  zoom: number;
  // 墨消し設定
  colorMode: 'black' | 'white';
  selectMode: 'text' | 'rect';
  pageRedactionCount: number;
  totalRedactionCount: number;
  hasLastSelectedArea: boolean;
  // 描画・校正設定
  appMode: AppMode;
  activeTool: DrawingTool;
  drawColor: string;
  lineWidth: number;
  fontSize: number;
  fillMode: FillMode;
  pageDrawingCount: number;
  totalDrawingCount: number;
  canUndo: boolean;
  // ハンドラ
  onPageChange: (newPage: number) => void;
  onZoomChange: (newZoom: number) => void;
  onColorModeChange: (mode: 'black' | 'white') => void;
  onSelectModeChange: (mode: 'text' | 'rect') => void;
  onClearPageRedactions: () => void;
  onClearAllRedactions: () => void;
  onKeywordSearch: (keyword: string, searchAllPages: boolean) => void;
  onApplyAreaToAllPages: () => void;
  onAppModeChange: (mode: AppMode) => void;
  onToolChange: (tool: DrawingTool) => void;
  onDrawColorChange: (color: string) => void;
  onLineWidthChange: (w: number) => void;
  onFontSizeChange: (size: number) => void;
  onFillModeChange: (mode: FillMode) => void;
  onUndo: () => void;
}

const COLOR_PALETTE = [
  { label: '赤', value: '#ef4444', ring: 'ring-red-400' },
  { label: '黒', value: '#0f172a', ring: 'ring-slate-400' },
  { label: '青', value: '#2563eb', ring: 'ring-blue-400' },
  { label: '緑', value: '#16a34a', ring: 'ring-green-400' },
  { label: '白', value: '#ffffff', ring: 'ring-slate-200' },
  { label: '橙', value: '#f97316', ring: 'ring-orange-400' },
]

export const Toolbar: React.FC<ToolbarProps> = ({
  currentPage,
  numPages,
  zoom,
  colorMode,
  selectMode,
  pageRedactionCount,
  totalRedactionCount,
  hasLastSelectedArea,
  appMode,
  activeTool,
  drawColor,
  lineWidth,
  fontSize,
  fillMode,
  pageDrawingCount,
  totalDrawingCount,
  canUndo,
  onPageChange,
  onZoomChange,
  onColorModeChange,
  onSelectModeChange,
  onClearPageRedactions,
  onClearAllRedactions,
  onKeywordSearch,
  onApplyAreaToAllPages,
  onAppModeChange,
  onToolChange,
  onDrawColorChange,
  onLineWidthChange,
  onFontSizeChange,
  onFillModeChange,
  onUndo,
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
    <div className="border-b border-slate-800 bg-slate-900/90 backdrop-blur px-6 py-2 flex flex-col gap-2 text-xs select-none">
      {/* 上段バー: ナビゲーション ＋ メインモード切替 ＋ 共通Undo/クリア */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* 左側: ページ送り ＆ ズーム */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage <= 0}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 transition cursor-pointer"
              title="前のページ"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="font-medium text-slate-300 flex items-center gap-1.5 px-1.5">
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
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 transition cursor-pointer"
              title="次のページ"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <button
              onClick={() => onZoomChange(Math.max(0.5, zoom - 0.2))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="縮小"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-semibold text-slate-300 min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => onZoomChange(Math.min(2.5, zoom + 0.2))}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              title="拡大"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => onZoomChange(1.0)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-400 font-medium cursor-pointer"
            >
              100%
            </button>
          </div>
        </div>

        {/* 中央: メインモード切替タブ [🧹 墨消し] ⇄ [✏️ 描画・校正] */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shadow-inner">
          <button
            onClick={() => onAppModeChange('eraser')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              appMode === 'eraser'
                ? 'bg-gradient-to-r from-rose-600 to-pink-600 text-white shadow-md shadow-rose-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Eraser className="w-4 h-4" />
            <span>🧹 墨消し（不可逆切除）</span>
          </button>
          <button
            onClick={() => onAppModeChange('draw')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
              appMode === 'draw'
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>✏️ 描画・校正（赤書・文字・囲み）</span>
          </button>
        </div>

        {/* 右側: Undo（元に戻す） ＆ クリア */}
        <div className="flex items-center gap-2">
          <button
            onClick={onUndo}
            disabled={!canUndo}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition flex items-center gap-1.5 cursor-pointer ${
              canUndo
                ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700 shadow-sm active:scale-95'
                : 'opacity-30 bg-slate-800/40 border-slate-800 text-slate-500 cursor-not-allowed'
            }`}
            title="直前の操作を元に戻す (Ctrl+Z / Cmd+Z)"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>元に戻す</span>
          </button>

          {pageRedactionCount > 0 && appMode === 'eraser' && (
            <button
              onClick={onClearPageRedactions}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs transition flex items-center gap-1.5 cursor-pointer"
              title="このページの消しゴム枠をすべて解除"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              <span>頁クリア ({pageRedactionCount})</span>
            </button>
          )}

          {totalRedactionCount > 0 && appMode === 'eraser' && (
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

      {/* 下段サブバー: モード別の操作ツール */}
      {appMode === 'eraser' ? (
        /* 墨消しモード用サブバー */
        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-800/60">
          {/* 消しゴムカラー（黒塗り / 白塗り） */}
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-medium">消しゴム色:</span>
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
            <span className="text-slate-400 font-medium">選択モード:</span>
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

          {/* キーワード一括検索消しゴム */}
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
        </div>
      ) : (
        /* 描画・校正モード用サブバー */
        <div className="flex flex-wrap items-center gap-4 pt-1 border-t border-slate-800/60">
          {/* ツール選択ボタングループ */}
          <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
            <button
              onClick={() => onToolChange('text')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeTool === 'text'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="テキスト打ち直し・朱書き文字"
            >
              <Type className="w-3.5 h-3.5" />
              文字
            </button>
            <button
              onClick={() => onToolChange('arrow')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeTool === 'arrow'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="引き出し線・矢印"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              矢印
            </button>
            <button
              onClick={() => onToolChange('line')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeTool === 'line'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="直線"
            >
              <Minus className="w-3.5 h-3.5" />
              直線
            </button>
            <button
              onClick={() => onToolChange('rect')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeTool === 'rect'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="矩形（四角囲み）"
            >
              <Square className="w-3.5 h-3.5" />
              四角囲み
            </button>
            <button
              onClick={() => onToolChange('polygon')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeTool === 'polygon'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="多角形（自由な境界囲み・ダブルクリックで閉じる）"
            >
              <Hexagon className="w-3.5 h-3.5" />
              多角形
            </button>
            <button
              onClick={() => onToolChange('circle')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeTool === 'circle'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="丸囲み（〇印）"
            >
              <Circle className="w-3.5 h-3.5" />
              丸
            </button>
            <button
              onClick={() => onToolChange('check')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md font-medium transition cursor-pointer ${
                activeTool === 'check'
                  ? 'bg-blue-600 text-white shadow-sm font-bold'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="チェック付け（レ点スタンプ）"
            >
              <Check className="w-3.5 h-3.5" />
              チェック
            </button>
          </div>

          {/* カラーパレット */}
          <div className="flex items-center gap-1.5 border-l border-slate-800 pl-3">
            <span className="text-slate-400 font-medium">色:</span>
            <div className="flex items-center gap-1">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c.value}
                  onClick={() => onDrawColorChange(c.value)}
                  className={`w-5 h-5 rounded-full border transition cursor-pointer ${
                    drawColor === c.value
                      ? `ring-2 ${c.ring} scale-110 border-white`
                      : 'border-slate-700 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.label}
                />
              ))}
            </div>
          </div>

          {/* 塗りモード（矩形・多角形・丸の場合） */}
          {(activeTool === 'rect' || activeTool === 'polygon' || activeTool === 'circle') && (
            <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
              <span className="text-slate-400 font-medium">塗り:</span>
              <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                <button
                  onClick={() => onFillModeChange('none')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    fillMode === 'none'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  枠線のみ
                </button>
                <button
                  onClick={() => onFillModeChange('semi')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    fillMode === 'semi'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title="下の文字が透けて見えるハイライト（透明度25%）"
                >
                  透かし
                </button>
                <button
                  onClick={() => onFillModeChange('solid')}
                  className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                    fillMode === 'solid'
                      ? 'bg-blue-600 text-white font-bold'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ベタ塗り
                </button>
              </div>
            </div>
          )}

          {/* 線の太さ（線・矢印・囲みの場合） */}
          {activeTool !== 'text' && activeTool !== 'check' && (
            <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
              <span className="text-slate-400 font-medium">太さ:</span>
              <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                {[1, 2, 4].map((w) => (
                  <button
                    key={w}
                    onClick={() => onLineWidthChange(w)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      lineWidth === w
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {w === 1 ? '細' : w === 2 ? '中' : '太'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 文字サイズ（テキストの場合） */}
          {activeTool === 'text' && (
            <div className="flex items-center gap-2 border-l border-slate-800 pl-3">
              <span className="text-slate-400 font-medium">文字サイズ:</span>
              <div className="flex bg-slate-800 p-0.5 rounded-lg border border-slate-700">
                {[
                  { label: '小 (12)', size: 12 },
                  { label: '中 (16)', size: 16 },
                  { label: '大 (20)', size: 20 },
                  { label: '特大 (24)', size: 24 },
                ].map((s) => (
                  <button
                    key={s.size}
                    onClick={() => onFontSizeChange(s.size)}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition cursor-pointer ${
                      fontSize === s.size
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 現在ページの描画オブジェクト数 */}
          {pageDrawingCount > 0 && (
            <span className="text-slate-400 text-[11px] ml-auto">
              現ページの描画: {pageDrawingCount} 個 (計 {totalDrawingCount} 個)
            </span>
          )}
        </div>
      )}
    </div>
  )
}
