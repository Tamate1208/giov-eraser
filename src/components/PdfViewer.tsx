import React, { useRef, useState, useEffect } from 'react'
import { RedactRect, PdfPageInfo } from '../utils/mupdfService'
import { X, Eraser } from 'lucide-react'

interface PdfViewerProps {
  pageImage: string | null;
  pageInfo: PdfPageInfo | null;
  redactions: RedactRect[];
  colorMode: 'black' | 'white';
  zoom: number;
  onAddRedaction: (rect: Omit<RedactRect, 'id'>) => void;
  onRemoveRedaction: (id: string) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pageImage,
  pageInfo,
  redactions,
  colorMode,
  zoom,
  onAddRedaction,
  onRemoveRedaction,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const overlayRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null)

  // プレビュー枠表示用の state
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null)

  // ポインターダウン: ドラッグ開始 (PointerCapture で確実追従)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pageInfo || !overlayRef.current) return
    e.preventDefault()
    e.stopPropagation()

    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {}

    const rect = target.getBoundingClientRect()
    // ズーム倍率で割ってローカル座標（ズーム前のCSSピクセル）を算出
    const relX = (e.clientX - rect.left) / zoom
    const relY = (e.clientY - rect.top) / zoom

    isDraggingRef.current = true
    dragStartRef.current = { x: relX, y: relY }
    dragCurrentRef.current = { x: relX, y: relY }
    setDragPreview({ x: relX, y: relY, w: 0, h: 0 })
  }

  // ポインター移動: ドラッグ追従
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current || !dragStartRef.current || !pageInfo || !overlayRef.current) return
    e.preventDefault()

    const rect = overlayRef.current.getBoundingClientRect()
    const maxX = pageInfo.width * 1.5
    const maxY = pageInfo.height * 1.5

    const relX = Math.max(0, Math.min(maxX, (e.clientX - rect.left) / zoom))
    const relY = Math.max(0, Math.min(maxY, (e.clientY - rect.top) / zoom))

    dragCurrentRef.current = { x: relX, y: relY }

    const sx = dragStartRef.current.x
    const sy = dragStartRef.current.y
    setDragPreview({
      x: Math.min(sx, relX),
      y: Math.min(sy, relY),
      w: Math.abs(relX - sx),
      h: Math.abs(relY - sy),
    })
  }

  // ポインターアップ: ドラッグ完了 -> 確実に消しゴム枠を追加
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const isDragging = isDraggingRef.current
    const start = dragStartRef.current
    const current = dragCurrentRef.current

    isDraggingRef.current = false
    dragStartRef.current = null
    dragCurrentRef.current = null
    setDragPreview(null)

    if (!isDragging || !start || !current || !pageInfo) return

    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {}

    const dx = Math.abs(current.x - start.x)
    const dy = Math.abs(current.y - start.y)

    // 最小4pxドラッグした場合に追加
    if (dx >= 4 && dy >= 4) {
      const minX = Math.min(start.x, current.x)
      const maxX = Math.max(start.x, current.x)
      const minY = Math.min(start.y, current.y)
      const maxY = Math.max(start.y, current.y)

      // 画面表示は 1.5倍 なので、PDFポイント座標系へは 1.5 で除算
      const pdfX0 = minX / 1.5
      const pdfX1 = maxX / 1.5
      const pdfY0 = minY / 1.5
      const pdfY1 = maxY / 1.5

      onAddRedaction({
        x0: pdfX0,
        y0: pdfY0,
        x1: pdfX1,
        y1: pdfY1,
        pageIndex: pageInfo.index,
        color: colorMode,
      })
    }
  }

  // PDF/MuPDF座標 [x0, y0, x1, y1] (左上原点) を画面CSSスタイル (top, left, width, height) に変換
  const getScreenStyle = (r: RedactRect) => {
    if (!pageInfo) return { display: 'none' }
    const left = r.x0 * 1.5
    const top = r.y0 * 1.5
    const width = (r.x1 - r.x0) * 1.5
    const height = (r.y1 - r.y0) * 1.5

    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    }
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-auto bg-slate-950 p-8 flex items-center justify-center relative select-none"
    >
      {pageImage && pageInfo ? (
        <div
          className="relative shadow-2xl rounded-sm ring-1 ring-slate-800 transition-transform duration-100"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
            width: `${pageInfo.width * 1.5}px`,
            height: `${pageInfo.height * 1.5}px`,
          }}
        >
          {/* PDF ページ画像 */}
          <img
            ref={imageRef}
            src={pageImage}
            alt={`Page ${pageInfo.index + 1}`}
            draggable={false}
            className="block max-w-none bg-white select-none pointer-events-none"
            style={{
              width: `${pageInfo.width * 1.5}px`,
              height: `${pageInfo.height * 1.5}px`,
            }}
          />

          {/* ドラッグ操作専用オーバーレイ (PointerCapture) */}
          <div
            ref={overlayRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              isDraggingRef.current = false
              dragStartRef.current = null
              dragCurrentRef.current = null
              setDragPreview(null)
            }}
            className="absolute inset-0 cursor-crosshair touch-none select-none z-10"
            title="マウスドラッグで消去したい範囲を囲んでください"
          >
            {/* ドラッグ中のプレビュー枠 */}
            {dragPreview && (
              <div
                style={{
                  left: `${dragPreview.x}px`,
                  top: `${dragPreview.y}px`,
                  width: `${dragPreview.w}px`,
                  height: `${dragPreview.h}px`,
                }}
                className={`absolute border-2 border-dashed pointer-events-none transition-none shadow-lg ${
                  colorMode === 'white'
                    ? 'bg-white/70 border-slate-400 ring-2 ring-white/60'
                    : 'bg-rose-600/40 border-rose-500 ring-2 ring-rose-500/40'
                }`}
              >
                <div className="absolute top-1 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10px] text-white font-mono flex items-center gap-1 shadow">
                  <Eraser className="w-2.5 h-2.5 text-rose-400" />
                  消去範囲
                </div>
              </div>
            )}
          </div>

          {/* 既存の墨消し枠オーバーレイ (z-20 で削除ボタンをクリック可能に) */}
          <div className="absolute inset-0 pointer-events-none z-20">
            {redactions.map((r) => {
              const style = getScreenStyle(r)
              const isWhite = r.color === 'white'

              return (
                <div
                  key={r.id}
                  style={style}
                  className={`absolute pointer-events-auto group border transition-all duration-100 ${
                    isWhite
                      ? 'bg-white/85 border-slate-300 ring-1 ring-white/50 shadow-sm'
                      : 'bg-black/90 border-rose-500/80 ring-1 ring-black/50 shadow-md'
                  }`}
                >
                  {/* 消しゴムマーク */}
                  <div className="absolute top-1 left-1 opacity-60 group-hover:opacity-100 transition">
                    <Eraser
                      className={`w-3 h-3 ${isWhite ? 'text-slate-700' : 'text-rose-400'}`}
                    />
                  </div>

                  {/* 削除ボタン */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveRedaction(r.id)
                    }}
                    className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-md transition transform hover:scale-110 active:scale-95 cursor-pointer"
                    title="この消しゴム枠を削除"
                  >
                    <X className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="text-center text-slate-500">
          <p>ページを読み込み中...</p>
        </div>
      )}
    </div>
  )
}
