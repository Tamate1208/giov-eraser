import React, { useRef, useState, useEffect } from 'react'
import { RedactRect, PdfPageInfo } from '../utils/mupdfService'
import {
  AppMode,
  DrawingTool,
  FillMode,
  ArrowHead,
  DrawingItem,
  Point,
} from '../types/drawing'
import { X, Eraser, Check, CornerDownLeft, Trash2 } from 'lucide-react'

// 数学的に確実な矢じりベクターパスを計算（始点・終点・両端対応）
function getArrowHeadPath(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  lineWidth: number,
  mode: ArrowHead = 'end'
): string {
  if (mode === 'none') return ''
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 5) return ''

  const angle = Math.atan2(dy, dx)
  const headLen = Math.min(len * 0.4, 12 + lineWidth * 2)
  let d = ''

  // 終点側の矢じり
  if (mode === 'end' || mode === 'both') {
    const ax1 = x2 - headLen * Math.cos(angle - Math.PI / 6)
    const ay1 = y2 - headLen * Math.sin(angle - Math.PI / 6)
    const ax2 = x2 - headLen * Math.cos(angle + Math.PI / 6)
    const ay2 = y2 - headLen * Math.sin(angle + Math.PI / 6)
    d += `M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2} `
  }

  // 始点側の矢じり
  if (mode === 'start' || mode === 'both') {
    const bx1 = x1 + headLen * Math.cos(angle - Math.PI / 6)
    const by1 = y1 + headLen * Math.sin(angle - Math.PI / 6)
    const bx2 = x1 + headLen * Math.cos(angle + Math.PI / 6)
    const by2 = y1 + headLen * Math.sin(angle + Math.PI / 6)
    d += `M ${bx1} ${by1} L ${x1} ${y1} L ${bx2} ${by2} `
  }

  return d
}

interface PdfViewerProps {
  pageImage: string | null;
  pageInfo: PdfPageInfo | null;
  redactions: RedactRect[];
  colorMode: 'black' | 'white';
  zoom: number;
  // 描画・校正設定
  appMode: AppMode;
  activeTool: DrawingTool;
  drawColor: string;
  lineWidth: number;
  fontSize: number;
  fillMode: FillMode;
  arrowHead: ArrowHead;
  checkSize: number;
  drawings: DrawingItem[];
  // ハンドラ
  onAddRedaction: (rect: Omit<RedactRect, 'id'>) => void;
  onRemoveRedaction: (id: string) => void;
  onAddDrawing: (item: Omit<DrawingItem, 'id'>) => void;
  onRemoveDrawing: (id: string) => void;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pageImage,
  pageInfo,
  redactions,
  colorMode,
  zoom,
  appMode,
  activeTool,
  drawColor,
  lineWidth,
  fontSize,
  fillMode,
  arrowHead,
  checkSize,
  drawings,
  onAddRedaction,
  onRemoveRedaction,
  onAddDrawing,
  onRemoveDrawing,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const overlayRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null)

  // プレビュー表示用の state
  const [dragPreview, setDragPreview] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)

  // 多角形描画用の頂点リスト
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)

  // テキスト入力ポップアップ用の state
  const [textInput, setTextInput] = useState<{
    x: number
    y: number
    text: string
    bgWhite: boolean
  } | null>(null)

  // 選択中のアイテムID（ホバーまたはクリックで削除できるように）
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)

  // 選択中アイテムの Delete / BackSpace キー削除
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        // テキスト入力中は除外
        if (textInput) return
        e.preventDefault()
        onRemoveDrawing(selectedDrawingId)
        setSelectedDrawingId(null)
      } else if (e.key === 'Escape') {
        setSelectedDrawingId(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedDrawingId, textInput, onRemoveDrawing])

  // テキスト入力の確定
  const handleConfirmText = () => {
    if (!textInput || !textInput.text.trim() || !pageInfo) {
      setTextInput(null)
      return
    }

    onAddDrawing({
      pageIndex: pageInfo.index,
      tool: 'text',
      color: drawColor,
      fillMode: 'none',
      lineWidth: 1,
      fontSize,
      text: textInput.text.trim(),
      bgWhite: textInput.bgWhite,
      x: textInput.x / 1.5,
      y: textInput.y / 1.5,
    })

    setTextInput(null)
  }

  // 多角形の確定
  const handleFinishPolygon = () => {
    if (polygonPoints.length < 3 || !pageInfo) {
      setPolygonPoints([])
      return
    }

    onAddDrawing({
      pageIndex: pageInfo.index,
      tool: 'polygon',
      color: drawColor,
      fillMode,
      lineWidth,
      fontSize,
      points: polygonPoints.map((p) => ({ x: p.x / 1.5, y: p.y / 1.5 })),
    })

    setPolygonPoints([])
  }

  // ポインターダウン: ドラッグ開始 または クリック操作
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pageInfo || !overlayRef.current) return

    // 選択を解除
    setSelectedDrawingId(null)

    // テキスト入力中なら確定/閉じる
    if (textInput) {
      handleConfirmText()
      return
    }

    e.preventDefault()
    e.stopPropagation()

    const target = e.currentTarget
    try {
      target.setPointerCapture(e.pointerId)
    } catch {}

    const rect = target.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / zoom
    const relY = (e.clientY - rect.top) / zoom

    // 描画モード: テキスト
    if (appMode === 'draw' && activeTool === 'text') {
      setTextInput({
        x: relX,
        y: relY,
        text: '',
        bgWhite: true, // デフォルトで白背景（墨消し跡の打ち直しに便利）
      })
      return
    }

    // 描画モード: チェックマーク（ワンタップ配置）
    if (appMode === 'draw' && activeTool === 'check') {
      const half = (checkSize * 1.5) / 2
      onAddDrawing({
        pageIndex: pageInfo.index,
        tool: 'check',
        color: drawColor,
        fillMode: 'none',
        lineWidth: Math.max(2, checkSize * 0.12),
        fontSize: checkSize,
        x: (relX - half) / 1.5,
        y: (relY - half) / 1.5,
        w: checkSize,
        h: checkSize,
      })
      return
    }

    // 描画モード: 多角形（頂点追加）
    if (appMode === 'draw' && activeTool === 'polygon') {
      // 始点クリックで閉じる判定 (15px以内)
      if (polygonPoints.length >= 3) {
        const start = polygonPoints[0]
        const dist = Math.hypot(relX - start.x, relY - start.y)
        if (dist <= 15) {
          handleFinishPolygon()
          return
        }
      }
      setPolygonPoints((prev) => [...prev, { x: relX, y: relY }])
      return
    }

    // それ以外のツール（消しゴム、矢印、直線、矩形、丸）はドラッグ開始
    isDraggingRef.current = true
    dragStartRef.current = { x: relX, y: relY }
    dragCurrentRef.current = { x: relX, y: relY }
    setDragPreview({
      startX: relX,
      startY: relY,
      currentX: relX,
      currentY: relY,
    })
  }

  // ポインター移動
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pageInfo || !overlayRef.current) return

    const rect = overlayRef.current.getBoundingClientRect()
    const maxX = pageInfo.width * 1.5
    const maxY = pageInfo.height * 1.5

    const relX = Math.max(0, Math.min(maxX, (e.clientX - rect.left) / zoom))
    const relY = Math.max(0, Math.min(maxY, (e.clientY - rect.top) / zoom))

    setMousePos({ x: relX, y: relY })

    if (!isDraggingRef.current || !dragStartRef.current) return
    e.preventDefault()

    dragCurrentRef.current = { x: relX, y: relY }
    setDragPreview({
      startX: dragStartRef.current.x,
      startY: dragStartRef.current.y,
      currentX: relX,
      currentY: relY,
    })
  }

  // ポインターアップ: ドラッグ完了
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

    // 最小4pxドラッグした場合のみ追加
    if (dx < 4 && dy < 4) return

    const minX = Math.min(start.x, current.x)
    const maxX = Math.max(start.x, current.x)
    const minY = Math.min(start.y, current.y)
    const maxY = Math.max(start.y, current.y)

    if (appMode === 'eraser') {
      // 消しゴム枠の追加
      onAddRedaction({
        x0: minX / 1.5,
        y0: minY / 1.5,
        x1: maxX / 1.5,
        y1: maxY / 1.5,
        pageIndex: pageInfo.index,
        color: colorMode,
      })
    } else if (appMode === 'draw') {
      // 描画アイテムの追加
      if (activeTool === 'arrow' || activeTool === 'line') {
        onAddDrawing({
          pageIndex: pageInfo.index,
          tool: activeTool,
          color: drawColor,
          lineWidth,
          fontSize,
          fillMode: 'none',
          arrowHead: activeTool === 'arrow' ? arrowHead : 'none',
          points: [
            { x: start.x / 1.5, y: start.y / 1.5 },
            { x: current.x / 1.5, y: current.y / 1.5 },
          ],
        })
      } else if (activeTool === 'rect') {
        onAddDrawing({
          pageIndex: pageInfo.index,
          tool: 'rect',
          color: drawColor,
          lineWidth,
          fontSize,
          fillMode,
          x: minX / 1.5,
          y: minY / 1.5,
          w: (maxX - minX) / 1.5,
          h: (maxY - minY) / 1.5,
        })
      } else if (activeTool === 'circle') {
        onAddDrawing({
          pageIndex: pageInfo.index,
          tool: 'circle',
          color: drawColor,
          lineWidth,
          fontSize,
          fillMode,
          x: minX / 1.5,
          y: minY / 1.5,
          w: (maxX - minX) / 1.5,
          h: (maxY - minY) / 1.5,
        })
      }
    }
  }

  // ダブルクリック（多角形の終了）
  const handleDoubleClick = () => {
    if (appMode === 'draw' && activeTool === 'polygon') {
      handleFinishPolygon()
    }
  }

  // 消しゴム枠の画面スタイル変換
  const getScreenStyle = (r: RedactRect) => {
    if (!pageInfo) return { display: 'none' }
    return {
      left: `${r.x0 * 1.5}px`,
      top: `${r.y0 * 1.5}px`,
      width: `${(r.x1 - r.x0) * 1.5}px`,
      height: `${(r.y1 - r.y0) * 1.5}px`,
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

          {/* SVG 描画オーバーレイ層（描画・校正アイテムの表示） */}
          <svg
            className="absolute inset-0 pointer-events-none z-20 overflow-visible"
            width={pageInfo.width * 1.5}
            height={pageInfo.height * 1.5}
          >
            {/* 確定済み描画アイテム一覧 */}
            {drawings.map((item) => {
              const isHovered = hoveredDrawingId === item.id
              const isSelected = selectedDrawingId === item.id

              if (item.tool === 'arrow' || item.tool === 'line') {
                if (!item.points || item.points.length < 2) return null
                const p0 = item.points[0]
                const p1 = item.points[1]
                const x1 = p0.x * 1.5
                const y1 = p0.y * 1.5
                const x2 = p1.x * 1.5
                const y2 = p1.y * 1.5

                const mode = item.arrowHead || (item.tool === 'arrow' ? 'end' : 'none')
                const arrowPath = getArrowHeadPath(x1, y1, x2, y2, item.lineWidth, mode)
                const midX = (x1 + x2) / 2
                const midY = (y1 + y2) / 2

                return (
                  <g
                    key={item.id}
                    className="pointer-events-auto cursor-pointer group"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDrawingId(item.id)
                    }}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {/* 選択時の外枠ハイライト */}
                    {isSelected && (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#38bdf8"
                        strokeWidth={item.lineWidth + 8}
                        strokeOpacity="0.4"
                        strokeLinecap="round"
                      />
                    )}

                    {/* 直線本体 */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={item.color}
                      strokeWidth={item.lineWidth * (isHovered || isSelected ? 1.3 : 1)}
                      strokeLinecap="round"
                    />

                    {/* 矢じりベクター */}
                    {arrowPath && (
                      <path
                        d={arrowPath}
                        stroke={item.color}
                        strokeWidth={item.lineWidth * (isHovered || isSelected ? 1.3 : 1)}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* 選択時・ホバー時の削除ボタン */}
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${midX}, ${midY})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveDrawing(item.id)
                          setSelectedDrawingId(null)
                        }}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <circle cx="0" cy="0" r="10" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                )
              }

              if (item.tool === 'rect') {
                if (item.x === undefined || item.y === undefined || item.w === undefined || item.h === undefined) return null
                const rx = item.x * 1.5
                const ry = item.y * 1.5
                const rw = item.w * 1.5
                const rh = item.h * 1.5

                const fillColor =
                  item.fillMode === 'solid'
                    ? item.color
                    : item.fillMode === 'semi'
                    ? item.color
                    : 'none'
                const fillOpacity = item.fillMode === 'semi' ? 0.25 : item.fillMode === 'solid' ? 1 : 0

                return (
                  <g
                    key={item.id}
                    className="pointer-events-auto cursor-pointer group"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDrawingId(item.id)
                    }}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isSelected && (
                      <rect
                        x={rx - 4}
                        y={ry - 4}
                        width={rw + 8}
                        height={rh + 8}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                        rx="4"
                      />
                    )}
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={item.color}
                      strokeWidth={item.lineWidth}
                    />
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${rx + rw}, ${ry})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveDrawing(item.id)
                          setSelectedDrawingId(null)
                        }}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <circle cx="0" cy="0" r="10" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                )
              }

              if (item.tool === 'circle') {
                if (item.x === undefined || item.y === undefined || item.w === undefined || item.h === undefined) return null
                const cx = (item.x + item.w / 2) * 1.5
                const cy = (item.y + item.h / 2) * 1.5
                const rx = (item.w / 2) * 1.5
                const ry = (item.h / 2) * 1.5

                const fillColor =
                  item.fillMode === 'solid'
                    ? item.color
                    : item.fillMode === 'semi'
                    ? item.color
                    : 'none'
                const fillOpacity = item.fillMode === 'semi' ? 0.25 : item.fillMode === 'solid' ? 1 : 0

                return (
                  <g
                    key={item.id}
                    className="pointer-events-auto cursor-pointer group"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDrawingId(item.id)
                    }}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isSelected && (
                      <ellipse
                        cx={cx}
                        cy={cy}
                        rx={rx + 4}
                        ry={ry + 4}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                    )}
                    <ellipse
                      cx={cx}
                      cy={cy}
                      rx={rx}
                      ry={ry}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={item.color}
                      strokeWidth={item.lineWidth}
                    />
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${cx + rx}, ${cy})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveDrawing(item.id)
                          setSelectedDrawingId(null)
                        }}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <circle cx="0" cy="0" r="10" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                )
              }

              if (item.tool === 'polygon') {
                if (!item.points || item.points.length < 3) return null
                const pts = item.points.map((p) => `${p.x * 1.5},${p.y * 1.5}`).join(' ')
                const fillColor =
                  item.fillMode === 'solid'
                    ? item.color
                    : item.fillMode === 'semi'
                    ? item.color
                    : 'none'
                const fillOpacity = item.fillMode === 'semi' ? 0.25 : item.fillMode === 'solid' ? 1 : 0

                return (
                  <g
                    key={item.id}
                    className="pointer-events-auto cursor-pointer group"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDrawingId(item.id)
                    }}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isSelected && (
                      <polygon
                        points={pts}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={item.lineWidth + 6}
                        strokeOpacity="0.4"
                      />
                    )}
                    <polygon
                      points={pts}
                      fill={fillColor}
                      fillOpacity={fillOpacity}
                      stroke={item.color}
                      strokeWidth={item.lineWidth}
                      strokeLinejoin="round"
                    />
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${item.points[0].x * 1.5}, ${item.points[0].y * 1.5})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveDrawing(item.id)
                          setSelectedDrawingId(null)
                        }}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <circle cx="0" cy="0" r="10" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                )
              }

              if (item.tool === 'check') {
                if (item.x === undefined || item.y === undefined) return null
                const ox = item.x * 1.5
                const oy = item.y * 1.5
                const s = (item.fontSize || 22) * 1.5

                return (
                  <g
                    key={item.id}
                    className="pointer-events-auto cursor-pointer group"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDrawingId(item.id)
                    }}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isSelected && (
                      <rect
                        x={ox - 3}
                        y={oy - 3}
                        width={s + 6}
                        height={s + 6}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="3 2"
                        rx="4"
                      />
                    )}
                    <path
                      d={`M ${ox + s * 0.15} ${oy + s * 0.55} L ${ox + s * 0.42} ${oy + s * 0.85} L ${ox + s * 0.9} ${oy + s * 0.18}`}
                      fill="none"
                      stroke={item.color}
                      strokeWidth={item.lineWidth || Math.max(2.5, s * 0.12)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${ox + s}, ${oy})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveDrawing(item.id)
                          setSelectedDrawingId(null)
                        }}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <circle cx="0" cy="0" r="9" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                        <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                )
              }

              if (item.tool === 'text') {
                if (item.x === undefined || item.y === undefined || !item.text) return null
                const tx = item.x * 1.5
                const ty = item.y * 1.5
                const fontPx = item.fontSize * 1.5
                const estW = item.text.length * fontPx * 0.95 + 8

                return (
                  <g
                    key={item.id}
                    className="pointer-events-auto cursor-pointer group"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation()
                      setSelectedDrawingId(item.id)
                    }}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {item.bgWhite && (
                      <rect
                        x={tx - 4}
                        y={ty - fontPx + 2}
                        width={estW}
                        height={fontPx + 6}
                        fill="#ffffff"
                        rx="2"
                        className="shadow-sm"
                      />
                    )}
                    {isSelected && (
                      <rect
                        x={tx - 6}
                        y={ty - fontPx}
                        width={estW + 4}
                        height={fontPx + 10}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="3 2"
                        rx="3"
                      />
                    )}
                    <text
                      x={tx}
                      y={ty}
                      fill={item.color}
                      fontSize={fontPx}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontWeight="bold"
                    >
                      {item.text}
                    </text>
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${tx - 8}, ${ty - fontPx / 2})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          onRemoveDrawing(item.id)
                          setSelectedDrawingId(null)
                        }}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <circle cx="0" cy="0" r="9" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                        <line x1="-3.5" y1="-3.5" x2="3.5" y2="3.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                        <line x1="3.5" y1="-3.5" x2="-3.5" y2="3.5" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
                      </g>
                    )}
                  </g>
                )
              }

              return null
            })}

            {/* 多角形描画中のリアルタイムガイド線 */}
            {appMode === 'draw' && activeTool === 'polygon' && polygonPoints.length > 0 && (
              <g>
                <polyline
                  points={polygonPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={drawColor}
                  strokeWidth={lineWidth}
                  strokeDasharray="4 4"
                />
                {mousePos && (
                  <line
                    x1={polygonPoints[polygonPoints.length - 1].x}
                    y1={polygonPoints[polygonPoints.length - 1].y}
                    x2={mousePos.x}
                    y2={mousePos.y}
                    stroke={drawColor}
                    strokeWidth={lineWidth}
                    strokeDasharray="2 2"
                  />
                )}
                {polygonPoints.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p.x}
                    cy={p.y}
                    r={idx === 0 ? 5 : 3}
                    fill={idx === 0 ? '#ef4444' : drawColor}
                    stroke="#ffffff"
                    strokeWidth="1.5"
                  />
                ))}
              </g>
            )}

            {/* ドラッグ中のプレビュー描画（矢印、直線、矩形、丸） */}
            {dragPreview && appMode === 'draw' && (
              <g style={{ color: drawColor }}>
                {(activeTool === 'arrow' || activeTool === 'line') && (
                  <>
                    <line
                      x1={dragPreview.startX}
                      y1={dragPreview.startY}
                      x2={dragPreview.currentX}
                      y2={dragPreview.currentY}
                      stroke={drawColor}
                      strokeWidth={lineWidth}
                      strokeLinecap="round"
                    />
                    {activeTool === 'arrow' && (
                      <path
                        d={getArrowHeadPath(
                          dragPreview.startX,
                          dragPreview.startY,
                          dragPreview.currentX,
                          dragPreview.currentY,
                          lineWidth,
                          arrowHead
                        )}
                        stroke={drawColor}
                        strokeWidth={lineWidth}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                  </>
                )}
                {activeTool === 'rect' && (
                  <rect
                    x={Math.min(dragPreview.startX, dragPreview.currentX)}
                    y={Math.min(dragPreview.startY, dragPreview.currentY)}
                    width={Math.abs(dragPreview.currentX - dragPreview.startX)}
                    height={Math.abs(dragPreview.currentY - dragPreview.startY)}
                    fill={
                      fillMode === 'solid'
                        ? drawColor
                        : fillMode === 'semi'
                        ? drawColor
                        : 'none'
                    }
                    fillOpacity={fillMode === 'semi' ? 0.25 : fillMode === 'solid' ? 1 : 0}
                    stroke={drawColor}
                    strokeWidth={lineWidth}
                    strokeDasharray="4 2"
                  />
                )}
                {activeTool === 'circle' && (
                  <ellipse
                    cx={(dragPreview.startX + dragPreview.currentX) / 2}
                    cy={(dragPreview.startY + dragPreview.currentY) / 2}
                    rx={Math.abs(dragPreview.currentX - dragPreview.startX) / 2}
                    ry={Math.abs(dragPreview.currentY - dragPreview.startY) / 2}
                    fill={
                      fillMode === 'solid'
                        ? drawColor
                        : fillMode === 'semi'
                        ? drawColor
                        : 'none'
                    }
                    fillOpacity={fillMode === 'semi' ? 0.25 : fillMode === 'solid' ? 1 : 0}
                    stroke={drawColor}
                    strokeWidth={lineWidth}
                    strokeDasharray="4 2"
                  />
                )}
              </g>
            )}
          </svg>

          {/* ドラッグ操作専用オーバーレイ (PointerCapture) */}
          <div
            ref={overlayRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onDoubleClick={handleDoubleClick}
            onPointerCancel={() => {
              isDraggingRef.current = false
              dragStartRef.current = null
              dragCurrentRef.current = null
              setDragPreview(null)
            }}
            className={`absolute inset-0 select-none z-10 ${
              appMode === 'eraser'
                ? 'cursor-crosshair'
                : activeTool === 'text'
                ? 'cursor-text'
                : activeTool === 'check'
                ? 'cursor-pointer'
                : 'cursor-crosshair'
            }`}
            title={
              appMode === 'eraser'
                ? 'マウスドラッグで消去したい範囲を囲んでください'
                : activeTool === 'text'
                ? 'クリックしてテキストを入力'
                : activeTool === 'polygon'
                ? 'クリックで頂点を結び、始点クリックまたはダブルクリックで完了'
                : 'ドラッグして描画'
            }
          >
            {/* 消しゴムドラッグ中のプレビュー枠 */}
            {dragPreview && appMode === 'eraser' && (
              <div
                style={{
                  left: `${Math.min(dragPreview.startX, dragPreview.currentX)}px`,
                  top: `${Math.min(dragPreview.startY, dragPreview.currentY)}px`,
                  width: `${Math.abs(dragPreview.currentX - dragPreview.startX)}px`,
                  height: `${Math.abs(dragPreview.currentY - dragPreview.startY)}px`,
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

          {/* テキスト入力ポップアップ */}
          {textInput && (
            <div
              style={{
                left: `${textInput.x}px`,
                top: `${textInput.y}px`,
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-30 bg-slate-900 border border-slate-700 p-2.5 rounded-xl shadow-2xl flex flex-col gap-2 min-w-[240px] animate-fade-in ring-1 ring-white/10"
            >
              <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                <span>テキスト・修正文字の入力</span>
                <span className="text-slate-500 text-[10px]">({fontSize}pt)</span>
              </div>
              <input
                autoFocus
                type="text"
                placeholder="文字を入力..."
                value={textInput.text}
                onChange={(e) => setTextInput({ ...textInput, text: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleConfirmText()
                  } else if (e.key === 'Escape') {
                    setTextInput(null)
                  }
                }}
                className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500 focus:outline-none"
                style={{ color: drawColor }}
              />
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={textInput.bgWhite}
                    onChange={(e) =>
                      setTextInput({ ...textInput, bgWhite: e.target.checked })
                    }
                    className="rounded bg-slate-800 border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>背景を白で隠す</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setTextInput(null)}
                    className="px-2 py-0.5 rounded text-slate-400 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmText}
                    className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white font-bold flex items-center gap-1 text-[11px] shadow-sm"
                  >
                    <CornerDownLeft className="w-3 h-3" />
                    決定
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 既存の墨消し枠オーバーレイ */}
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
                  <div className="absolute top-1 left-1 opacity-60 group-hover:opacity-100 transition">
                    <Eraser
                      className={`w-3 h-3 ${isWhite ? 'text-slate-700' : 'text-rose-400'}`}
                    />
                  </div>

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
