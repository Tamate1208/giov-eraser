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

  // ドラッグ選択の状態
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null)

  // 画像要素の実際の表示サイズと位置
  const [imgLayout, setImgLayout] = useState<{ width: number; height: number; left: number; top: number }>({
    width: 0,
    height: 0,
    left: 0,
    top: 0,
  })

  // 画像サイズ更新
  const updateLayout = () => {
    if (imageRef.current) {
      const rect = imageRef.current.getBoundingClientRect()
      const containerRect = containerRef.current?.getBoundingClientRect() || { left: 0, top: 0 }
      setImgLayout({
        width: rect.width,
        height: rect.height,
        left: rect.left - containerRect.left,
        top: rect.top - containerRect.top,
      })
    }
  }

  useEffect(() => {
    updateLayout()
  }, [pageImage, zoom])

  // マウスダウン: ドラッグ開始
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageRef.current || !pageInfo) return
    const rect = imageRef.current.getBoundingClientRect()

    // 画像内の相対座標 (0〜width, 0〜height)
    const relX = e.clientX - rect.left
    const relY = e.clientY - rect.top

    if (relX >= 0 && relX <= rect.width && relY >= 0 && relY <= rect.height) {
      setIsDragging(true)
      setDragStart({ x: relX, y: relY })
      setDragCurrent({ x: relX, y: relY })
    }
  }

  // マウス移動: ドラッグ中
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !imageRef.current) return
    const rect = imageRef.current.getBoundingClientRect()

    const relX = Math.max(0, Math.min(rect.width, e.clientX - rect.left))
    const relY = Math.max(0, Math.min(rect.height, e.clientY - rect.top))

    setDragCurrent({ x: relX, y: relY })
  }

  // マウスアップ: ドラッグ完了 -> PDF座標系に変換して矩形追加
  const handleMouseUp = () => {
    if (!isDragging || !dragStart || !dragCurrent || !pageInfo || !imageRef.current) {
      setIsDragging(false)
      setDragStart(null)
      setDragCurrent(null)
      return
    }

    const dx = Math.abs(dragCurrent.x - dragStart.x)
    const dy = Math.abs(dragCurrent.y - dragStart.y)

    // 最小サイズ判定 (5px以上ドラッグした場合のみ追加)
    if (dx >= 5 && dy >= 5) {
      const minScreenX = Math.min(dragStart.x, dragCurrent.x)
      const maxScreenX = Math.max(dragStart.x, dragCurrent.x)
      const minScreenY = Math.min(dragStart.y, dragCurrent.y)
      const maxScreenY = Math.max(dragStart.y, dragCurrent.y)

      const displayW = imageRef.current.clientWidth
      const displayH = imageRef.current.clientHeight

      // 画面座標 (左上原点) から PDF座標系 (左下原点 [x0, y0, x1, y1]) への正規化変換
      const scaleX = pageInfo.width / displayW
      const scaleY = pageInfo.height / displayH

      const pdfX0 = minScreenX * scaleX
      const pdfX1 = maxScreenX * scaleX
      // PDF は Y=0 が下端
      const pdfY0 = (displayH - maxScreenY) * scaleY
      const pdfY1 = (displayH - minScreenY) * scaleY

      onAddRedaction({
        x0: pdfX0,
        y0: pdfY0,
        x1: pdfX1,
        y1: pdfY1,
        pageIndex: pageInfo.index,
        color: colorMode,
      })
    }

    setIsDragging(false)
    setDragStart(null)
    setDragCurrent(null)
  }

  // PDF座標 [x0, y0, x1, y1] を画面CSSスタイル (top, left, width, height) に変換
  const getScreenStyle = (r: RedactRect) => {
    if (!pageInfo || !imageRef.current) return { display: 'none' }
    const displayW = imageRef.current.clientWidth
    const displayH = imageRef.current.clientHeight

    const scaleX = displayW / pageInfo.width
    const scaleY = displayH / pageInfo.height

    const left = r.x0 * scaleX
    const top = displayH - r.y1 * scaleY
    const width = (r.x1 - r.x0) * scaleX
    const height = (r.y1 - r.y0) * scaleY

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
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="flex-1 overflow-auto bg-slate-950 p-8 flex items-center justify-center relative select-none"
      style={{ cursor: isDragging ? 'crosshair' : 'default' }}
    >
      {pageImage && pageInfo ? (
        <div
          className="relative shadow-2xl rounded-sm ring-1 ring-slate-800 transition-all duration-150"
          style={{
            transform: `scale(${zoom})`,
            transformOrigin: 'center center',
          }}
        >
          {/* PDF ページ画像 */}
          <img
            ref={imageRef}
            src={pageImage}
            alt={`Page ${pageInfo.index + 1}`}
            onLoad={updateLayout}
            onMouseDown={handleMouseDown}
            draggable={false}
            className="block max-w-none bg-white pointer-events-auto cursor-crosshair"
            style={{
              width: `${pageInfo.width * 1.5}px`,
              height: `${pageInfo.height * 1.5}px`,
            }}
          />

          {/* 既存の墨消し枠オーバーレイ */}
          <div className="absolute inset-0 pointer-events-none">
            {redactions.map((r) => {
              const style = getScreenStyle(r)
              const isWhite = r.color === 'white'

              return (
                <div
                  key={r.id}
                  style={style}
                  className={`absolute pointer-events-auto group border transition-all duration-100 ${
                    isWhite
                      ? 'bg-white/80 border-slate-300 ring-1 ring-white/50 shadow-sm'
                      : 'bg-black/85 border-rose-500/80 ring-1 ring-black/50 shadow-md'
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
                    className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 shadow-md transition transform hover:scale-110 active:scale-95"
                    title="この消しゴム枠を削除"
                  >
                    <X className="w-3 h-3 stroke-[2.5]" />
                  </button>
                </div>
              )
            })}

            {/* ドラッグ中のプレビュー枠 */}
            {isDragging && dragStart && dragCurrent && (
              <div
                style={{
                  left: `${Math.min(dragStart.x, dragCurrent.x)}px`,
                  top: `${Math.min(dragStart.y, dragCurrent.y)}px`,
                  width: `${Math.abs(dragCurrent.x - dragStart.x)}px`,
                  height: `${Math.abs(dragCurrent.y - dragStart.y)}px`,
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
        </div>
      ) : (
        <div className="text-center text-slate-500">
          <p>ページを読み込み中...</p>
        </div>
      )}
    </div>
  )
}
