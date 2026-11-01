import React, { useRef, useState, useEffect } from 'react'
import { DeskDoc, DeskItem } from '../types/desk'
import { generateDeskItemThumbnail } from '../utils/deskService'
import {
  X,
  Plus,
  ArrowUp,
  ArrowDown,
  RotateCw,
  Trash2,
  Download,
  FolderOpen,
  FileText,
  Layers,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'

interface DeskSidebarProps {
  width: number;
  isOpen: boolean;
  items: DeskItem[];
  docsMap: Map<string, DeskDoc>;
  currentPageIndex: number;
  currentDocName: string | null;
  onClose: () => void;
  onResizeWidth: (w: number) => void;
  onAddCurrentPage: () => void;
  onAddPdfFiles: (files: FileList) => void;
  onMoveItem: (fromIndex: number, toIndex: number) => void;
  onRotateItem: (id: string) => void;
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
  onExportMergedPdf: () => void;
  onLoadAsCurrentDoc: () => void;
  onSelectDeskItemPreview?: (item: DeskItem) => void;
  isProcessing?: boolean;
}

export const DeskSidebar: React.FC<DeskSidebarProps> = ({
  width,
  isOpen,
  items,
  docsMap,
  currentPageIndex,
  currentDocName,
  onClose,
  onResizeWidth,
  onAddCurrentPage,
  onAddPdfFiles,
  onMoveItem,
  onRotateItem,
  onRemoveItem,
  onClearAll,
  onExportMergedPdf,
  onLoadAsCurrentDoc,
  onSelectDeskItemPreview,
  isProcessing = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef<number>(0)
  const resizeStartWidthRef = useRef<number>(width)

  // アイテムのサムネイルを非同期生成
  useEffect(() => {
    let active = true
    items.forEach(async (item) => {
      const key = `${item.id}_rot${item.rotation}`
      if (thumbnails.has(key)) return

      const doc = docsMap.get(item.docId)
      if (!doc) return

      const url = await generateDeskItemThumbnail(doc.bytes, item.pageIndex, item.rotation)
      if (active && url) {
        setThumbnails((prev) => new Map(prev).set(key, url))
      }
    })
    return () => {
      active = false
    }
  }, [items, docsMap])

  // ドラッグリサイズ処理
  useEffect(() => {
    if (!isResizing) return

    const handlePointerMove = (e: PointerEvent) => {
      // 右サイドバーなので、左に引くと幅が増え、右に引くと幅が減る
      const deltaX = resizeStartXRef.current - e.clientX
      const newWidth = Math.min(650, Math.max(260, resizeStartWidthRef.current + deltaX))
      onResizeWidth(newWidth)
    }

    const handlePointerUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing, onResizeWidth])

  if (!isOpen) return null

  return (
    <aside
      style={{ width: `${width}px` }}
      className="relative shrink-0 border-l border-slate-800 bg-slate-900/90 backdrop-blur-md flex flex-col select-none shadow-2xl z-20 transition-all duration-75"
    >
      {/* リサイザーバー (左端) */}
      <div
        onPointerDown={(e) => {
          e.preventDefault()
          setIsResizing(true)
          resizeStartXRef.current = e.clientX
          resizeStartWidthRef.current = width
        }}
        onDoubleClick={() => onResizeWidth(340)}
        title="ドラッグで幅を調整 / ダブルクリックで標準幅に戻す"
        className={`absolute left-0 top-0 bottom-0 w-1.5 -ml-1 cursor-col-resize hover:bg-blue-500 transition-colors z-30 group flex items-center justify-center ${
          isResizing ? 'bg-blue-500' : 'bg-transparent'
        }`}
      >
        <div className="w-0.5 h-8 bg-slate-600 rounded-full group-hover:bg-white transition-colors" />
      </div>

      {/* 隠しファイルinput */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddPdfFiles(e.target.files)
            e.target.value = ''
          }
        }}
      />

      {/* ヘッダー */}
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-500/20 text-blue-400 rounded-lg border border-blue-500/30">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>作業机</span>
              <span className="text-[11px] font-mono px-2 py-0.2 rounded-full bg-slate-800 text-blue-300 border border-slate-700">
                {items.length} ページ
              </span>
            </div>
            <div className="text-[10px] text-slate-400">必要な頁を束ねて再編纂</div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          title="作業机を閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 操作アクションバー */}
      <div className="p-3 border-b border-slate-800/80 bg-slate-900/60 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 px-2.5 py-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer"
            title="別のPDFファイルを追加して机の上に並べます"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>PDFを追加</span>
          </button>

          {currentDocName && (
            <button
              onClick={onAddCurrentPage}
              className="flex-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer"
              title={`現在表示中のページ (p.${currentPageIndex + 1}) を作業机に置きます`}
            >
              <FileText className="w-3.5 h-3.5 text-blue-400" />
              <span>現在の頁を置く</span>
            </button>
          )}
        </div>

        {items.length > 0 && (
          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-0.5">
            <span>並べ替え・回転・抽出が可能</span>
            <button
              onClick={() => {
                if (window.confirm('作業机のページをすべてクリアしますか？')) {
                  onClearAll()
                }
              }}
              className="text-slate-500 hover:text-rose-400 transition cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3 h-3" />
              <span>机を空にする</span>
            </button>
          </div>
        )}
      </div>

      {/* 机の上のページカードリスト */}
      <div
        className="flex-1 overflow-y-auto p-3 space-y-2.5"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onAddPdfFiles(e.dataTransfer.files)
          }
        }}
      >
        {items.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-800 rounded-xl bg-slate-950/40 text-slate-500 space-y-3">
            <div className="p-3 bg-slate-800/60 rounded-full text-slate-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-bold text-slate-300 mb-1">作業机は空です</div>
              <div className="text-[11px] leading-relaxed">
                上の「PDFを追加」または「現在の頁を置く」を押すか、PDFファイルをここにドロップしてください。
              </div>
            </div>
          </div>
        ) : (
          items.map((item, idx) => {
            const thumbKey = `${item.id}_rot${item.rotation}`
            const thumbUrl = thumbnails.get(thumbKey)

            return (
              <div
                key={item.id}
                onClick={() => onSelectDeskItemPreview?.(item)}
                className="group relative bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 hover:border-blue-500/50 rounded-xl p-2 flex items-center gap-3 transition shadow-md cursor-pointer"
              >
                {/* 順番番号 */}
                <div className="w-5 text-center text-xs font-mono font-bold text-slate-400 shrink-0">
                  {idx + 1}
                </div>

                {/* サムネイル */}
                <div className="w-14 h-18 bg-slate-950 rounded-lg overflow-hidden border border-slate-700 shrink-0 relative flex items-center justify-center">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={`p.${item.pageNumber}`}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-blue-500/30 border-t-blue-500 animate-spin" />
                  )}
                  {item.rotation !== 0 && (
                    <span className="absolute bottom-1 right-1 bg-black/80 text-[9px] text-emerald-400 px-1 rounded font-mono">
                      {item.rotation}°
                    </span>
                  )}
                </div>

                {/* 情報 */}
                <div className="flex-1 min-w-0 pr-1">
                  <div
                    className="text-xs font-semibold text-slate-200 truncate"
                    title={item.docName}
                  >
                    {item.docName}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    第 {item.pageNumber} ページ
                  </div>
                </div>

                {/* 操作アクションボタン群 */}
                <div
                  className="flex flex-col gap-1 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => onMoveItem(idx, idx - 1)}
                      className="p-1 rounded bg-slate-700/60 hover:bg-slate-600 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                      title="上へ移動"
                    >
                      <ArrowUp className="w-3 h-3" />
                    </button>
                    <button
                      disabled={idx === items.length - 1}
                      onClick={() => onMoveItem(idx, idx + 1)}
                      className="p-1 rounded bg-slate-700/60 hover:bg-slate-600 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
                      title="下へ移動"
                    >
                      <ArrowDown className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onRotateItem(item.id)}
                      className="p-1 rounded bg-slate-700/60 hover:bg-emerald-600/80 text-slate-300 hover:text-white transition cursor-pointer"
                      title="90°右回転"
                    >
                      <RotateCw className="w-3 h-3 text-emerald-400" />
                    </button>
                    <button
                      onClick={() => onRemoveItem(item.id)}
                      className="p-1 rounded bg-slate-700/60 hover:bg-rose-600/80 text-slate-300 hover:text-white transition cursor-pointer"
                      title="机から外す"
                    >
                      <Trash2 className="w-3 h-3 text-rose-400" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* フッター: 出力アクション */}
      {items.length > 0 && (
        <div className="p-3 border-t border-slate-800 bg-slate-950/80 flex flex-col gap-2">
          <button
            onClick={onExportMergedPdf}
            disabled={isProcessing}
            className="w-full px-4 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-600/25 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>束ねてPDFを出力 ({items.length} 頁)</span>
          </button>

          <button
            onClick={onLoadAsCurrentDoc}
            disabled={isProcessing}
            className="w-full px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium flex items-center justify-center gap-1.5 border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
            title="編纂したPDFをそのままメイン画面で開いて墨消し・校正を続行します"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400" />
            <span>この編纂内容を作業対象にする</span>
          </button>
        </div>
      )}
    </aside>
  )
}
