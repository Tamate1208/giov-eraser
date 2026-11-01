import React, { useRef, useState, useEffect } from 'react'
import { RedactRect, PdfPageInfo } from '../utils/mupdfService'
import {
  AppMode,
  DrawingTool,
  FillMode,
  ArrowHead,
  DrawingItem,
  Point,
  RulerMeasureMode,
} from '../types/drawing'
import {
  X,
  Eraser,
  Check,
  CornerDownLeft,
  Trash2,
  Move,
  Ruler,
  ArrowRight,
  RotateCw,
  Square,
  Type,
} from 'lucide-react'

// 多角形の面積 (pt^2) を計算 (Shoelace formula)
function calculatePolygonAreaPt(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].y
    area -= points[j].x * points[i].y
  }
  return Math.abs(area) / 2
}

// 多角形の外周長 (pt) を計算
function calculatePolygonPerimeterPt(points: { x: number; y: number }[]): number {
  if (points.length < 2) return 0
  let perimeter = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    perimeter += Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y)
  }
  return perimeter
}

// 多角形の重心 (Center of mass)
function calculatePolygonCentroid(points: { x: number; y: number }[]): Point {
  if (points.length === 0) return { x: 0, y: 0 }
  let sumX = 0
  let sumY = 0
  for (const p of points) {
    sumX += p.x
    sumY += p.y
  }
  return { x: sumX / points.length, y: sumY / points.length }
}

// 距離のフォーマット（用紙mmと縮尺scaleから現地実長文字列を生成）
function formatRealDistance(distMm: number, scale: number): { realStr: string; sheetStr: string } {
  const sheetStr = `${distMm.toFixed(1)} mm`
  if (scale === 1) {
    return { realStr: sheetStr, sheetStr }
  }
  const realMm = distMm * scale
  if (scale <= 50) {
    return { realStr: `${realMm.toFixed(1)} mm`, sheetStr }
  }
  const realM = realMm / 1000
  return { realStr: `${realM.toFixed(2)} m`, sheetStr }
}

// 面積のフォーマット（用紙mm2と縮尺scaleから現地面積文字列を生成）
function formatRealArea(
  areaMm2: number,
  perimeterMm: number,
  scale: number
): {
  realAreaStr: string;
  sheetAreaStr: string;
  realPerimeterStr: string;
} {
  const sheetAreaStr = `${areaMm2.toFixed(1)} mm²`
  if (scale === 1) {
    return {
      realAreaStr: sheetAreaStr,
      sheetAreaStr,
      realPerimeterStr: `${perimeterMm.toFixed(1)} mm`,
    }
  }
  const realMm2 = areaMm2 * scale * scale
  const realM2 = realMm2 / 1_000_000
  const realPerimeterM = (perimeterMm * scale) / 1000

  const realAreaStr = `${realM2.toFixed(2)} m²`
  const realPerimeterStr = `${realPerimeterM.toFixed(2)} m`

  return { realAreaStr, sheetAreaStr, realPerimeterStr }
}

// テキストの描画幅を文字種（全角・半角）に応じて高精度に算出するヘルパー
function estimateTextWidth(text: string, fontPx: number): number {
  if (!text) return 10
  let width = 0
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    // 半角文字 (ASCII, 半角カタカナ等)
    if (code <= 0x007f || (code >= 0xff61 && code <= 0xff9f)) {
      if (ch === ' ' || ch === '.' || ch === ',' || ch === ':' || ch === ';' || ch === '!' || ch === 'l' || ch === 'i') {
        width += fontPx * 0.32
      } else if (ch >= '0' && ch <= '9') {
        width += fontPx * 0.58
      } else if (ch >= 'A' && ch <= 'Z') {
        width += fontPx * 0.65
      } else {
        width += fontPx * 0.52
      }
    } else {
      // 全角文字 (漢字・ひらがな・カタカナ・全角記号等)
      width += fontPx * 0.98
    }
  }
  return Math.ceil(width) + 6 // 左右にわずか3pxずつの余白
}

// 角度・スナップ計算ヘルパー (Shiftキー押下時: 水平・垂直・45度ロック、正方形・真円ロック)
function applyShiftSnap(
  startX: number,
  startY: number,
  currentX: number,
  currentY: number,
  tool: DrawingTool
): { x: number; y: number } {
  const dx = currentX - startX
  const dy = currentY - startY

  if (tool === 'rect' || tool === 'circle') {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    return {
      x: startX + (dx >= 0 ? side : -side),
      y: startY + (dy >= 0 ? side : -side),
    }
  }

  // 直線・矢印・物差しのスナップ (水平、垂直、45度)
  const angle = Math.atan2(Math.abs(dy), Math.abs(dx))
  if (angle < Math.PI / 8) {
    // 水平 (0度)
    return { x: currentX, y: startY }
  }
  if (angle > (Math.PI * 3) / 8) {
    // 垂直 (90度)
    return { x: startX, y: currentY }
  }
  // 45度
  const d = Math.max(Math.abs(dx), Math.abs(dy))
  return {
    x: startX + (dx >= 0 ? d : -d),
    y: startY + (dy >= 0 ? d : -d),
  }
}

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
  // 美しいシャープなプロ製図開度（片側18度 / 全開36度）
  const arrowAngle = Math.PI / 10
  const headLen = Math.min(len * 0.35, 14 + lineWidth * 2)
  let d = ''

  // 終点側の矢じり
  if (mode === 'end' || mode === 'both') {
    const ax1 = x2 - headLen * Math.cos(angle - arrowAngle)
    const ay1 = y2 - headLen * Math.sin(angle - arrowAngle)
    const ax2 = x2 - headLen * Math.cos(angle + arrowAngle)
    const ay2 = y2 - headLen * Math.sin(angle + arrowAngle)
    d += `M ${ax1} ${ay1} L ${x2} ${y2} L ${ax2} ${ay2} `
  }

  // 始点側の矢じり
  if (mode === 'start' || mode === 'both') {
    const bx1 = x1 + headLen * Math.cos(angle - arrowAngle)
    const by1 = y1 + headLen * Math.sin(angle - arrowAngle)
    const bx2 = x1 + headLen * Math.cos(angle + arrowAngle)
    const by2 = y1 + headLen * Math.sin(angle + arrowAngle)
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
  // 物差し・縮尺設定
  rulerScale?: number;
  rulerMeasureMode?: RulerMeasureMode;
  // ハンドラ
  onZoomChange?: (newZoom: number) => void;
  resetViewTrigger?: number;
  onAddRedaction: (rect: Omit<RedactRect, 'id'>) => void;
  onRemoveRedaction: (id: string) => void;
  onAddDrawing: (item: Omit<DrawingItem, 'id'>) => void;
  onUpdateDrawing?: (id: string, updates: Partial<DrawingItem>, recordHistory?: boolean) => void;
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
  rulerScale = 100,
  rulerMeasureMode = 'distance',
  onZoomChange,
  resetViewTrigger,
  onAddRedaction,
  onRemoveRedaction,
  onAddDrawing,
  onUpdateDrawing,
  onRemoveDrawing,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)

  const overlayRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragCurrentRef = useRef<{ x: number; y: number } | null>(null)

  // スペースキー押下状態 ＆ キャンバス移動（ダイレクトパン）用の state / ref
  const [isSpacePressed, setIsSpacePressed] = useState(false)
  const [isPanning, setIsPanning] = useState(false)
  const isPanningRef = useRef(false)
  const panStartRef = useRef<{ x: number; y: number } | null>(null)

  // 用紙のダイレクトパン位置（画面中央からのオフセット x, y）
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const panOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const panOffsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    panOffsetRef.current = panOffset
  }, [panOffset])

  // ページ切り替え時または「100%(中央)」ボタン押下時に位置を画面中央にリセット
  useEffect(() => {
    setPanOffset({ x: 0, y: 0 })
  }, [pageInfo?.index, resetViewTrigger])

  // プレビュー表示用の state
  const [dragPreview, setDragPreview] = useState<{
    startX: number
    startY: number
    currentX: number
    currentY: number
  } | null>(null)

  // オブジェクトドラッグ移動用の state
  const [movingDrawingId, setMovingDrawingId] = useState<string | null>(null)
  const moveStartPointerRef = useRef<{ x: number; y: number } | null>(null)
  const moveItemSnapshotRef = useRef<DrawingItem | null>(null)

  // 物差し（寸法・面積計測）確定時のバッジ表示用 state
  interface RulerResultData {
    type: 'distance' | 'area'
    scale: number
    color?: string
    isFromObject?: boolean
    // 距離用
    x1?: number
    y1?: number
    x2?: number
    y2?: number
    distMm?: number
    distPx?: number
    angleDeg?: number
    realLengthStr?: string
    // 面積用
    points?: Point[]
    areaMm2?: number
    realAreaStr?: string
    realPerimeterStr?: string
    center?: Point
  }
  const [rulerResult, setRulerResult] = useState<RulerResultData | null>(null)

  // ツール切り替え時に物差し計測結果や計測途中の頂点をクリア
  useEffect(() => {
    if (activeTool !== 'ruler') {
      setRulerResult(null)
      setRulerAreaPoints([])
    }
  }, [activeTool])

  // 物差しの面積計測用多角形頂点リスト
  const [rulerAreaPoints, setRulerAreaPoints] = useState<Point[]>([])

  // 多角形描画用の頂点リスト
  const [polygonPoints, setPolygonPoints] = useState<Point[]>([])
  const [mousePos, setMousePos] = useState<Point | null>(null)

  // テキスト入力ポップアップ用の state
  const [textInput, setTextInput] = useState<{
    x: number
    y: number
    text: string
    bgWhite: boolean
    rotation: number
    editingId?: string
  } | null>(null)

  // テキスト回転ドラッグ用の state
  const [rotatingDrawingId, setRotatingDrawingId] = useState<string | null>(null)
  const rotateCenterRef = useRef<{ x: number; y: number } | null>(null)
  const rotateStartAngleRef = useRef<number>(0)
  const rotateInitialAngleRef = useRef<number>(0)

  // 線への吸着ガイド表示用 state
  const [snapGuide, setSnapGuide] = useState<{
    x1: number
    y1: number
    x2: number
    y2: number
    midX: number
    midY: number
    targetX: number
    targetY: number
    angle: number
  } | null>(null)
  const snapGuideRef = useRef<{
    targetX: number
    targetY: number
    angle: number
  } | null>(null)

  // 選択中のアイテムID（ホバーまたはクリックで削除できるように）
  const [hoveredDrawingId, setHoveredDrawingId] = useState<string | null>(null)
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null)

  // オブジェクト（描画アイテム）の寸法・面積を自動計測
  const handleMeasureDrawing = (item: DrawingItem) => {
    if (!pageInfo) return

    // 1. 直線 / 矢印: 長さと角度を計測
    if (item.tool === 'line' || item.tool === 'arrow') {
      if (!item.points || item.points.length < 2) return
      const p0 = item.points[0]
      const p1 = item.points[1]
      const x1 = p0.x * 1.5
      const y1 = p0.y * 1.5
      const x2 = p1.x * 1.5
      const y2 = p1.y * 1.5
      const dx = x2 - x1
      const dy = y2 - y1
      const len = Math.hypot(dx, dy)
      if (len < 1) return

      const distPt = len / 1.5
      const distMm = distPt * (25.4 / 72)
      let angleDeg = Math.round((Math.atan2(dy, dx) * 180) / Math.PI)
      if (angleDeg < 0) angleDeg += 360

      const { realStr } = formatRealDistance(distMm, rulerScale)

      setRulerResult({
        type: 'distance',
        scale: rulerScale,
        color: item.color,
        isFromObject: true,
        x1,
        y1,
        x2,
        y2,
        distMm,
        realLengthStr: realStr,
        angleDeg,
      })
      return
    }

    // 2. 矩形: 縦横寸法・外周長・面積を計測
    if (item.tool === 'rect') {
      if (item.x === undefined || item.y === undefined || item.w === undefined || item.h === undefined) return
      const rx = item.x * 1.5
      const ry = item.y * 1.5
      const rw = Math.abs(item.w * 1.5)
      const rh = Math.abs(item.h * 1.5)
      if (rw < 1 || rh < 1) return

      const wMm = (rw / 1.5) * (25.4 / 72)
      const hMm = (rh / 1.5) * (25.4 / 72)
      const areaMm2 = wMm * hMm
      const perimeterMm = 2 * (wMm + hMm)

      const { realAreaStr, realPerimeterStr } = formatRealArea(areaMm2, perimeterMm, rulerScale)

      const pts: Point[] = [
        { x: rx, y: ry },
        { x: rx + rw, y: ry },
        { x: rx + rw, y: ry + rh },
        { x: rx, y: ry + rh },
      ]

      setRulerResult({
        type: 'area',
        scale: rulerScale,
        color: item.color,
        isFromObject: true,
        points: pts,
        areaMm2,
        realAreaStr,
        realPerimeterStr,
        center: { x: rx + rw / 2, y: ry + rh / 2 },
      })
      return
    }

    // 3. 円・楕円: 半径・外周長・面積を計測
    if (item.tool === 'circle') {
      if (item.x === undefined || item.y === undefined || item.w === undefined || item.h === undefined) return
      const cx = (item.x + item.w / 2) * 1.5
      const cy = (item.y + item.h / 2) * 1.5
      const rx = Math.abs((item.w / 2) * 1.5)
      const ry = Math.abs((item.h / 2) * 1.5)
      if (rx < 1 || ry < 1) return

      const rxMm = (rx / 1.5) * (25.4 / 72)
      const ryMm = (ry / 1.5) * (25.4 / 72)
      const areaMm2 = Math.PI * rxMm * ryMm
      const h = Math.pow(rxMm - ryMm, 2) / Math.pow(rxMm + ryMm, 2)
      const perimeterMm = Math.PI * (rxMm + ryMm) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)))

      const { realAreaStr, realPerimeterStr } = formatRealArea(areaMm2, perimeterMm, rulerScale)

      const pts: Point[] = []
      const steps = 36
      for (let i = 0; i < steps; i++) {
        const theta = (i / steps) * 2 * Math.PI
        pts.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta),
        })
      }

      setRulerResult({
        type: 'area',
        scale: rulerScale,
        color: item.color,
        isFromObject: true,
        points: pts,
        areaMm2,
        realAreaStr,
        realPerimeterStr,
        center: { x: cx, y: cy },
      })
      return
    }

    // 4. 多角形: 各辺外周長・面積を計測
    if (item.tool === 'polygon') {
      if (!item.points || item.points.length < 3) return
      const ptsInPt = item.points
      const areaPt2 = calculatePolygonAreaPt(ptsInPt)
      const perimeterPt = calculatePolygonPerimeterPt(ptsInPt)
      const centerPt = calculatePolygonCentroid(ptsInPt)

      const areaMm2 = areaPt2 * Math.pow(25.4 / 72, 2)
      const perimeterMm = perimeterPt * (25.4 / 72)

      const { realAreaStr, realPerimeterStr } = formatRealArea(areaMm2, perimeterMm, rulerScale)

      const screenPts = ptsInPt.map((p) => ({ x: p.x * 1.5, y: p.y * 1.5 }))

      setRulerResult({
        type: 'area',
        scale: rulerScale,
        color: item.color,
        isFromObject: true,
        points: screenPts,
        areaMm2,
        realAreaStr,
        realPerimeterStr,
        center: { x: centerPt.x * 1.5, y: centerPt.y * 1.5 },
      })
      return
    }
  }

  // 墨消し枠（不可逆マスク枠）の寸法・面積を自動計測
  const handleMeasureRedaction = (r: RedactRect) => {
    if (!pageInfo) return
    const rx = Math.min(r.x0, r.x1) * 1.5
    const ry = Math.min(r.y0, r.y1) * 1.5
    const rw = Math.abs(r.x1 - r.x0) * 1.5
    const rh = Math.abs(r.y1 - r.y0) * 1.5
    if (rw < 1 || rh < 1) return

    const wMm = (rw / 1.5) * (25.4 / 72)
    const hMm = (rh / 1.5) * (25.4 / 72)
    const areaMm2 = wMm * hMm
    const perimeterMm = 2 * (wMm + hMm)

    const { realAreaStr, realPerimeterStr } = formatRealArea(areaMm2, perimeterMm, rulerScale)

    const pts: Point[] = [
      { x: rx, y: ry },
      { x: rx + rw, y: ry },
      { x: rx + rw, y: ry + rh },
      { x: rx, y: ry + rh },
    ]

    setRulerResult({
      type: 'area',
      scale: rulerScale,
      color: '#10b981',
      isFromObject: true,
      points: pts,
      areaMm2,
      realAreaStr,
      realPerimeterStr,
      center: { x: rx + rw / 2, y: ry + rh / 2 },
    })
  }

  // 描画アイテムクリック処理（描画消しゴム時は即座に削除、物差しツール時のみ自動計測）
  const handleItemClick = (item: DrawingItem, e: React.MouseEvent) => {
    e.stopPropagation()
    if (appMode === 'draw' && activeTool === 'draw_eraser') {
      onRemoveDrawing(item.id)
      if (selectedDrawingId === item.id) setSelectedDrawingId(null)
      return
    }
    setSelectedDrawingId(item.id)
    if (appMode === 'draw' && activeTool === 'ruler') {
      handleMeasureDrawing(item)
    } else if (activeTool === 'select') {
      setRulerResult(null)
    }
  }

  // テキストのインライン再編集開始
  const handleStartEditText = (item: DrawingItem, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setTextInput({
      x: (item.x ?? 0) * 1.5,
      y: (item.y ?? 0) * 1.5,
      text: item.text ?? '',
      bgWhite: item.bgWhite ?? true,
      rotation: item.rotation ?? 0,
      editingId: item.id,
    })
    setSelectedDrawingId(item.id)
  }

  // 描画アイテム上でのポインターダウン処理（ドラッグ移動の開始）
  const handleItemPointerDown = (item: DrawingItem, e: React.PointerEvent) => {
    if (appMode === 'draw' && activeTool === 'draw_eraser') {
      // 描画消しゴムはクリック時に削除するためここでは移動開始しない
      return
    }
    // 選択移動ツール中、または既に選択されているアイテムならドラッグ移動開始
    if (activeTool === 'select' || selectedDrawingId === item.id) {
      e.stopPropagation()
      setRulerResult(null)
      setSelectedDrawingId(item.id)
      setMovingDrawingId(item.id)
      moveStartPointerRef.current = { x: e.clientX, y: e.clientY }
      moveItemSnapshotRef.current = JSON.parse(JSON.stringify(item))
      snapGuideRef.current = null
      setSnapGuide(null)
    }
  }

  // テキスト回転ハンドルのドラッグ開始処理
  const handleRotateStart = (item: DrawingItem, e: React.PointerEvent) => {
    e.stopPropagation()
    setRotatingDrawingId(item.id)
    const tx = (item.x ?? 0) * 1.5
    const ty = (item.y ?? 0) * 1.5
    const fontPx = item.fontSize * 1.5
    const estW = estimateTextWidth(item.text || '', fontPx)
    // テキストの中心座標
    const cx = tx + estW / 2
    const cy = ty - fontPx / 2
    rotateCenterRef.current = { x: cx, y: cy }
    rotateInitialAngleRef.current = item.rotation || 0

    const rect = overlayRef.current?.getBoundingClientRect()
    if (rect) {
      const px = (e.clientX - rect.left) / zoom
      const py = (e.clientY - rect.top) / zoom
      rotateStartAngleRef.current = Math.atan2(py - cy, px - cx)
    }
  }

  // テキスト回転ドラッグ中のグローバル追従と確定
  useEffect(() => {
    if (!rotatingDrawingId) return

    const handleGlobalRotateMove = (e: PointerEvent) => {
      if (!rotateCenterRef.current || !overlayRef.current) return
      const rect = overlayRef.current.getBoundingClientRect()
      const px = (e.clientX - rect.left) / zoom
      const py = (e.clientY - rect.top) / zoom

      const cx = rotateCenterRef.current.x
      const cy = rotateCenterRef.current.y
      const curAngleRad = Math.atan2(py - cy, px - cx)
      const diffDeg = ((curAngleRad - rotateStartAngleRef.current) * 180) / Math.PI
      let newRot = Math.round(rotateInitialAngleRef.current + diffDeg)

      // Shiftキー押下時は 15度刻みスナップ
      if (e.shiftKey) {
        newRot = Math.round(newRot / 15) * 15
      }

      newRot = ((newRot % 360) + 360) % 360
      onUpdateDrawing?.(rotatingDrawingId, { rotation: newRot }, false)
    }

    const handleGlobalRotateUp = (e: PointerEvent) => {
      if (rotateCenterRef.current && overlayRef.current) {
        const rect = overlayRef.current.getBoundingClientRect()
        const px = (e.clientX - rect.left) / zoom
        const py = (e.clientY - rect.top) / zoom

        const cx = rotateCenterRef.current.x
        const cy = rotateCenterRef.current.y
        const curAngleRad = Math.atan2(py - cy, px - cx)
        const diffDeg = ((curAngleRad - rotateStartAngleRef.current) * 180) / Math.PI
        let newRot = Math.round(rotateInitialAngleRef.current + diffDeg)

        if (e.shiftKey) {
          newRot = Math.round(newRot / 15) * 15
        }

        newRot = ((newRot % 360) + 360) % 360
        onUpdateDrawing?.(rotatingDrawingId, { rotation: newRot }, true)
      }
      setRotatingDrawingId(null)
      rotateCenterRef.current = null
    }

    window.addEventListener('pointermove', handleGlobalRotateMove)
    window.addEventListener('pointerup', handleGlobalRotateUp)
    return () => {
      window.removeEventListener('pointermove', handleGlobalRotateMove)
      window.removeEventListener('pointerup', handleGlobalRotateUp)
    }
  }, [rotatingDrawingId, zoom, onUpdateDrawing])

  // オブジェクトドラッグ移動中のグローバルポインター追従と確定（線への吸着付き）
  useEffect(() => {
    if (!movingDrawingId) return

    const handleGlobalPointerMove = (e: PointerEvent) => {
      if (!moveItemSnapshotRef.current || !moveStartPointerRef.current) return
      const deltaX = (e.clientX - moveStartPointerRef.current.x) / zoom / 1.5
      const deltaY = (e.clientY - moveStartPointerRef.current.y) / zoom / 1.5

      const snap = moveItemSnapshotRef.current
      let updates: Partial<DrawingItem> = {}

      if (snap.tool === 'line' || snap.tool === 'arrow') {
        if (snap.points && snap.points.length >= 2) {
          updates = {
            points: snap.points.map((p) => ({
              x: Math.round((p.x + deltaX) * 10) / 10,
              y: Math.round((p.y + deltaY) * 10) / 10,
            })),
          }
        }
      } else if (snap.tool === 'polygon') {
        if (snap.points) {
          updates = {
            points: snap.points.map((p) => ({
              x: Math.round((p.x + deltaX) * 10) / 10,
              y: Math.round((p.y + deltaY) * 10) / 10,
            })),
          }
        }
      } else if (snap.tool === 'text') {
        // テキストの移動 ＋ 直線への平行・中点吸着（スマートマグネット）
        const fontPx = (snap.fontSize || 16) * 1.5
        const estW = estimateTextWidth(snap.text || '', fontPx)

        let curX = Math.round(((snap.x ?? 0) + deltaX) * 10) / 10
        let curY = Math.round(((snap.y ?? 0) + deltaY) * 10) / 10
        let curRot = snap.rotation || 0

        const textCenterScreenX = (curX + estW / 1.5 / 2) * 1.5
        const textCenterScreenY = (curY - fontPx / 1.5 / 2) * 1.5

        let bestSnap: {
          x: number
          y: number
          rot: number
          guide: any
        } | null = null
        let minDistance = 28 // 吸着しきい値 (28px以内)

        for (const item of drawings) {
          if (item.pageIndex !== snap.pageIndex) continue
          if (item.tool !== 'line' && item.tool !== 'arrow') continue
          if (!item.points || item.points.length < 2) continue

          const lx1 = item.points[0].x * 1.5
          const ly1 = item.points[0].y * 1.5
          const lx2 = item.points[1].x * 1.5
          const ly2 = item.points[1].y * 1.5

          const lineLen = Math.hypot(lx2 - lx1, ly2 - ly1)
          if (lineLen < 15) continue

          const ux = (lx2 - lx1) / lineLen
          const uy = (ly2 - ly1) / lineLen
          const nx = -uy
          const ny = ux

          // 線の角度（可読性補正: 人間が読みやすい左→右、下→上）
          let lineAngle = (Math.atan2(ly2 - ly1, lx2 - lx1) * 180) / Math.PI
          if (lineAngle > 90) lineAngle -= 180
          if (lineAngle < -90) lineAngle += 180

          const midX = (lx1 + lx2) / 2
          const midY = (ly1 + ly2) / 2
          const offsetDist = fontPx * 0.65 + 6

          const upX = midX + nx * offsetDist
          const upY = midY + ny * offsetDist
          const downX = midX - nx * offsetDist
          const downY = midY - ny * offsetDist

          const distUp = Math.hypot(textCenterScreenX - upX, textCenterScreenY - upY)
          const distDown = Math.hypot(textCenterScreenX - downX, textCenterScreenY - downY)

          if (distUp < minDistance) {
            minDistance = distUp
            bestSnap = {
              x: (upX - estW / 2) / 1.5,
              y: (upY + fontPx / 2) / 1.5,
              rot: Math.round(lineAngle),
              guide: {
                x1: lx1,
                y1: ly1,
                x2: lx2,
                y2: ly2,
                midX,
                midY,
                targetX: upX,
                targetY: upY,
                angle: Math.round(lineAngle),
              },
            }
          } else if (distDown < minDistance) {
            minDistance = distDown
            bestSnap = {
              x: (downX - estW / 2) / 1.5,
              y: (downY + fontPx / 2) / 1.5,
              rot: Math.round(lineAngle),
              guide: {
                x1: lx1,
                y1: ly1,
                x2: lx2,
                y2: ly2,
                midX,
                midY,
                targetX: downX,
                targetY: downY,
                angle: Math.round(lineAngle),
              },
            }
          }
        }

        if (bestSnap) {
          curX = Math.round(bestSnap.x * 10) / 10
          curY = Math.round(bestSnap.y * 10) / 10
          curRot = bestSnap.rot
          snapGuideRef.current = {
            targetX: curX,
            targetY: curY,
            angle: curRot,
          }
          setSnapGuide(bestSnap.guide)
        } else {
          snapGuideRef.current = null
          setSnapGuide(null)
        }

        updates = {
          x: curX,
          y: curY,
          rotation: curRot,
        }
      } else {
        updates = {
          x: Math.round(((snap.x ?? 0) + deltaX) * 10) / 10,
          y: Math.round(((snap.y ?? 0) + deltaY) * 10) / 10,
        }
      }

      onUpdateDrawing?.(movingDrawingId, updates, false)
    }

    const handleGlobalPointerUp = (e: PointerEvent) => {
      if (moveItemSnapshotRef.current && moveStartPointerRef.current) {
        const deltaX = (e.clientX - moveStartPointerRef.current.x) / zoom / 1.5
        const deltaY = (e.clientY - moveStartPointerRef.current.y) / zoom / 1.5

        if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5 || snapGuideRef.current) {
          const snap = moveItemSnapshotRef.current
          let updates: Partial<DrawingItem> = {}

          if (snap.tool === 'line' || snap.tool === 'arrow') {
            if (snap.points && snap.points.length >= 2) {
              updates = {
                points: snap.points.map((p) => ({
                  x: Math.round((p.x + deltaX) * 10) / 10,
                  y: Math.round((p.y + deltaY) * 10) / 10,
                })),
              }
            }
          } else if (snap.tool === 'polygon') {
            if (snap.points) {
              updates = {
                points: snap.points.map((p) => ({
                  x: Math.round((p.x + deltaX) * 10) / 10,
                  y: Math.round((p.y + deltaY) * 10) / 10,
                })),
              }
            }
          } else if (snap.tool === 'text') {
            if (snapGuideRef.current) {
              updates = {
                x: snapGuideRef.current.targetX,
                y: snapGuideRef.current.targetY,
                rotation: snapGuideRef.current.angle,
              }
            } else {
              updates = {
                x: Math.round(((snap.x ?? 0) + deltaX) * 10) / 10,
                y: Math.round(((snap.y ?? 0) + deltaY) * 10) / 10,
                rotation: snap.rotation || 0,
              }
            }
          } else {
            updates = {
              x: Math.round(((snap.x ?? 0) + deltaX) * 10) / 10,
              y: Math.round(((snap.y ?? 0) + deltaY) * 10) / 10,
            }
          }
          // 履歴記録付きで確定
          onUpdateDrawing?.(movingDrawingId, updates, true)
        }
      }

      setMovingDrawingId(null)
      moveStartPointerRef.current = null
      moveItemSnapshotRef.current = null
      snapGuideRef.current = null
      setSnapGuide(null)
    }

    window.addEventListener('pointermove', handleGlobalPointerMove)
    window.addEventListener('pointerup', handleGlobalPointerUp)
    return () => {
      window.removeEventListener('pointermove', handleGlobalPointerMove)
      window.removeEventListener('pointerup', handleGlobalPointerUp)
    }
  }, [movingDrawingId, zoom, drawings, onUpdateDrawing])

  // キーボードイベント (Delete/Backspace, Escape, Enter, Space手のひら)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // スペースキー長押しで手のひらモード
      if (e.code === 'Space') {
        const activeTag = document.activeElement?.tagName?.toLowerCase()
        if (activeTag !== 'input' && activeTag !== 'textarea' && !textInput) {
          e.preventDefault()
          setIsSpacePressed(true)
          return
        }
      }

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        // テキスト入力中は除外
        if (textInput) return
        e.preventDefault()
        onRemoveDrawing(selectedDrawingId)
        setSelectedDrawingId(null)
      } else if (e.key === 'Escape') {
        setSelectedDrawingId(null)
        setRulerResult(null)
        setSnapGuide(null)
        setRulerAreaPoints([])
      } else if (e.key === 'Enter') {
        if (
          appMode === 'draw' &&
          activeTool === 'ruler' &&
          rulerMeasureMode === 'area' &&
          rulerAreaPoints.length >= 3
        ) {
          e.preventDefault()
          handleFinishRulerArea()
        }
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false)
      }
    }

    const handleBlur = () => {
      setIsSpacePressed(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [
    selectedDrawingId,
    textInput,
    onRemoveDrawing,
    appMode,
    activeTool,
    rulerMeasureMode,
    rulerAreaPoints,
    pageInfo,
    rulerScale,
  ])

  // マウスホイールによるズーム操作（Ctrl/Cmd/Alt + ホイール、または手のひらツール選択中のホイール回転）
  useEffect(() => {
    const container = containerRef.current
    if (!container || !onZoomChange) return

    const handleWheel = (e: WheelEvent) => {
      const shouldZoom = e.ctrlKey || e.metaKey || e.altKey || activeTool === 'pan'
      if (shouldZoom) {
        e.preventDefault()

        const rect = container.getBoundingClientRect()
        const cx = rect.width / 2
        const cy = rect.height / 2
        const mouseRelX = e.clientX - rect.left - cx
        const mouseRelY = e.clientY - rect.top - cy

        const zoomDelta = e.deltaY < 0 ? 1.15 : 0.87
        const newZoom = Math.min(5.0, Math.max(0.2, Math.round(zoom * zoomDelta * 100) / 100))

        if (newZoom !== zoom) {
          const r = newZoom / zoom
          const currentPan = panOffsetRef.current
          const newPanX = currentPan.x + (1 - r) * (mouseRelX - currentPan.x)
          const newPanY = currentPan.y + (1 - r) * (mouseRelY - currentPan.y)

          setPanOffset({ x: newPanX, y: newPanY })
          onZoomChange(newZoom)
        }
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [zoom, activeTool, onZoomChange])

  // 物差しの面積計測の確定
  const handleFinishRulerArea = () => {
    if (rulerAreaPoints.length < 3 || !pageInfo) {
      setRulerAreaPoints([])
      return
    }

    const ptsPt = rulerAreaPoints.map((p) => ({ x: p.x / 1.5, y: p.y / 1.5 }))
    const areaPt2 = calculatePolygonAreaPt(ptsPt)
    const perimPt = calculatePolygonPerimeterPt(ptsPt)

    const mmPerPt = 25.4 / 72
    const areaMm2 = areaPt2 * mmPerPt * mmPerPt
    const perimMm = perimPt * mmPerPt

    const { realAreaStr, sheetAreaStr, realPerimeterStr } = formatRealArea(
      areaMm2,
      perimMm,
      rulerScale
    )
    const center = calculatePolygonCentroid(rulerAreaPoints)

    setRulerResult({
      type: 'area',
      scale: rulerScale,
      color: '#10b981',
      isFromObject: false,
      points: [...rulerAreaPoints],
      areaMm2: Math.round(areaMm2 * 10) / 10,
      realAreaStr,
      realPerimeterStr,
      center,
    })

    setRulerAreaPoints([])
  }

  // 物差しの計測結果（距離または面積）を図面に寸法線・注記として書き残す
  const handleBakeRulerToDrawing = () => {
    if (!rulerResult || !pageInfo) return

    // オブジェクト計測時はその色、手動計測時は常にエメラルドグリーン（#10b981）
    const targetColor = rulerResult.isFromObject && rulerResult.color ? rulerResult.color : '#10b981'

    if (rulerResult.type === 'distance') {
      const { x1 = 0, y1 = 0, x2 = 0, y2 = 0, realLengthStr, distMm = 0, angleDeg = 0 } = rulerResult

      // 手動計測時のみ寸法線を追加（オブジェクト計測時は既存の線があるので寸法線を複製しない）
      if (!rulerResult.isFromObject) {
        onAddDrawing({
          pageIndex: pageInfo.index,
          tool: 'line',
          color: targetColor,
          lineWidth: 2,
          fontSize: 12,
          fillMode: 'none',
          arrowHead: 'both',
          points: [
            { x: x1 / 1.5, y: y1 / 1.5 },
            { x: x2 / 1.5, y: y2 / 1.5 },
          ],
        })
      }

      // 寸法テキストを追加（中央に白背景付き・線に平行な角度）
      const midX = (x1 + x2) / 2 / 1.5
      const midY = (y1 + y2) / 2 / 1.5
      let textRot = angleDeg
      if (textRot > 90 && textRot <= 270) textRot -= 180

      const textLabel = realLengthStr || `${distMm.toFixed(1)} mm`

      onAddDrawing({
        pageIndex: pageInfo.index,
        tool: 'text',
        color: targetColor,
        fillMode: 'none',
        lineWidth: 1,
        fontSize: 12,
        text: textLabel,
        bgWhite: true,
        rotation: textRot,
        x: midX - 30,
        y: midY - 6,
      })
    } else if (rulerResult.type === 'area' && rulerResult.points) {
      const { points, realAreaStr, realPerimeterStr, center } = rulerResult

      // 手動計測時のみ多角形枠を追加（オブジェクト計測時は既存の図形があるので複製しない！）
      if (!rulerResult.isFromObject) {
        onAddDrawing({
          pageIndex: pageInfo.index,
          tool: 'polygon',
          color: targetColor,
          fillMode: 'none',
          lineWidth: 2,
          fontSize: 12,
          points: points.map((p) => ({ x: p.x / 1.5, y: p.y / 1.5 })),
        })
      }

      // 重心に面積テキストラベルを注記（『A=』のみ）
      const c = center || { x: 0, y: 0 }
      const textLabel = `A=${realAreaStr}`

      onAddDrawing({
        pageIndex: pageInfo.index,
        tool: 'text',
        color: targetColor,
        fillMode: 'none',
        lineWidth: 1,
        fontSize: 12,
        text: textLabel,
        bgWhite: true,
        rotation: 0,
        x: c.x / 1.5 - 40,
        y: c.y / 1.5 - 8,
      })
    }

    setRulerResult(null)
  }

  // テキスト入力の確定（新規追加または既存更新）
  const handleConfirmText = () => {
    if (!textInput || !textInput.text.trim() || !pageInfo) {
      setTextInput(null)
      return
    }

    if (textInput.editingId) {
      // 既存テキストの更新
      onUpdateDrawing?.(
        textInput.editingId,
        {
          text: textInput.text.trim(),
          bgWhite: textInput.bgWhite,
          rotation: textInput.rotation || 0,
        },
        true
      )
    } else {
      // 新規テキストの追加
      onAddDrawing({
        pageIndex: pageInfo.index,
        tool: 'text',
        color: drawColor,
        fillMode: 'none',
        lineWidth: 1,
        fontSize,
        text: textInput.text.trim(),
        bgWhite: textInput.bgWhite,
        rotation: textInput.rotation || 0,
        x: textInput.x / 1.5,
        y: textInput.y / 1.5,
      })
    }

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

    // パン移動（手のひらツール、Spaceキー押下中、中ボタン、右ボタン）の判定
    const isPanTrigger =
      activeTool === 'pan' ||
      isSpacePressed ||
      e.button === 1 ||
      e.button === 2

    if (isPanTrigger) {
      isPanningRef.current = true
      setIsPanning(true)
      panStartRef.current = { x: e.clientX, y: e.clientY }
      panOffsetStartRef.current = { ...panOffsetRef.current }
      return
    }

    const rect = target.getBoundingClientRect()
    const relX = (e.clientX - rect.left) / zoom
    const relY = (e.clientY - rect.top) / zoom

    // 描画モード: 選択移動ツール（オブジェクトをクリックして動かすため、背景ドラッグは行わない）
    if (appMode === 'draw' && activeTool === 'select') {
      return
    }

    // 描画モード: 描画消しゴム（ドラッグ操作不要、描画要素をクリックして削除）
    if (appMode === 'draw' && activeTool === 'draw_eraser') {
      return
    }

    // 描画モード: 物差し
    if (appMode === 'draw' && activeTool === 'ruler') {
      if (rulerMeasureMode === 'area') {
        // 始点クリックで閉じる判定 (15px以内)
        if (rulerAreaPoints.length >= 3) {
          const start = rulerAreaPoints[0]
          const dist = Math.hypot(relX - start.x, relY - start.y)
          if (dist <= 15) {
            handleFinishRulerArea()
            return
          }
        }
        setRulerAreaPoints((prev) => [...prev, { x: relX, y: relY }])
        return
      } else {
        // 距離計測: 前回の計測結果をクリア
        setRulerResult(null)
      }
    }

    // 描画モード: テキスト
    if (appMode === 'draw' && activeTool === 'text') {
      setTextInput({
        x: relX,
        y: relY,
        text: '',
        bgWhite: true, // デフォルトで白背景（墨消し跡の打ち直しに便利）
        rotation: 0,
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

    // それ以外のツール（消しゴム、直線、矩形、丸、物差し）はドラッグ開始
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

    // パン移動中の処理
    if (isPanningRef.current && panStartRef.current) {
      e.preventDefault()
      const dx = e.clientX - panStartRef.current.x
      const dy = e.clientY - panStartRef.current.y
      setPanOffset({
        x: panOffsetStartRef.current.x + dx,
        y: panOffsetStartRef.current.y + dy,
      })
      return
    }

    const rect = overlayRef.current.getBoundingClientRect()
    const maxX = pageInfo.width * 1.5
    const maxY = pageInfo.height * 1.5

    const relX = Math.max(0, Math.min(maxX, (e.clientX - rect.left) / zoom))
    const relY = Math.max(0, Math.min(maxY, (e.clientY - rect.top) / zoom))

    setMousePos({ x: relX, y: relY })

    if (!isDraggingRef.current || !dragStartRef.current) return
    e.preventDefault()

    let curX = relX
    let curY = relY

    // Shiftキー押下時のスナップ（直線・矢印・矩形・丸・物差し）
    if (
      e.shiftKey &&
      (activeTool === 'line' ||
        activeTool === 'arrow' ||
        activeTool === 'rect' ||
        activeTool === 'circle' ||
        activeTool === 'ruler')
    ) {
      const snapped = applyShiftSnap(
        dragStartRef.current.x,
        dragStartRef.current.y,
        relX,
        relY,
        activeTool
      )
      curX = snapped.x
      curY = snapped.y
    }

    dragCurrentRef.current = { x: curX, y: curY }
    setDragPreview({
      startX: dragStartRef.current.x,
      startY: dragStartRef.current.y,
      currentX: curX,
      currentY: curY,
    })
  }

  // ポインターアップ: ドラッグ完了
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // パン移動の完了
    if (isPanningRef.current) {
      isPanningRef.current = false
      setIsPanning(false)
      panStartRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {}
      return
    }
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

    let endX = current.x
    let endY = current.y

    // Shiftキー押下時のスナップ
    if (
      e.shiftKey &&
      (activeTool === 'line' ||
        activeTool === 'arrow' ||
        activeTool === 'rect' ||
        activeTool === 'circle' ||
        activeTool === 'ruler')
    ) {
      const snapped = applyShiftSnap(start.x, start.y, endX, endY, activeTool)
      endX = snapped.x
      endY = snapped.y
    }

    const dx = Math.abs(endX - start.x)
    const dy = Math.abs(endY - start.y)

    // 最小3pxドラッグした場合のみ追加
    if (dx < 3 && dy < 3) return

    const minX = Math.min(start.x, endX)
    const maxX = Math.max(start.x, endX)
    const minY = Math.min(start.y, endY)
    const maxY = Math.max(start.y, endY)

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
      // 物差しツール: 寸法計測結果の登録
      if (activeTool === 'ruler') {
        const dxPx = endX - start.x
        const dyPx = endY - start.y
        const distPx = Math.hypot(dxPx, dyPx)
        if (distPx < 3) return
        const distPt = distPx / 1.5
        const distMm = distPt * (25.4 / 72)
        let angleDeg = Math.round((Math.atan2(dyPx, dxPx) * 180) / Math.PI)
        if (angleDeg < 0) angleDeg += 360

        const { realStr } = formatRealDistance(distMm, rulerScale)

        setRulerResult({
          type: 'distance',
          scale: rulerScale,
          color: '#10b981',
          isFromObject: false,
          x1: start.x,
          y1: start.y,
          x2: endX,
          y2: endY,
          distMm: Math.round(distMm * 10) / 10,
          distPx: Math.round(distPx),
          angleDeg,
          realLengthStr: realStr,
        })
        return
      }

      // 描画アイテムの追加
      if (activeTool === 'line' || activeTool === 'arrow') {
        onAddDrawing({
          pageIndex: pageInfo.index,
          tool: 'line',
          color: drawColor,
          lineWidth,
          fontSize,
          fillMode: 'none',
          arrowHead: arrowHead,
          points: [
            { x: start.x / 1.5, y: start.y / 1.5 },
            { x: endX / 1.5, y: endY / 1.5 },
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

  // カーソルスタイルの判定（スペースキー押下中または手のひらツールの時は grab/grabbing）
  const getCursorClass = () => {
    if (isSpacePressed || activeTool === 'pan') {
      return isPanning ? 'cursor-grabbing' : 'cursor-grab'
    }
    if (appMode === 'eraser') return 'cursor-crosshair'
    if (activeTool === 'select') return 'cursor-default'
    if (activeTool === 'ruler') return 'cursor-crosshair'
    if (activeTool === 'text') return 'cursor-text'
    if (activeTool === 'check' || activeTool === 'draw_eraser') return 'cursor-pointer'
    return 'cursor-crosshair'
  }

  return (
    <div
      ref={containerRef}
      onContextMenu={(e) => e.preventDefault()}
      onPointerDown={(e) => {
        // 背景クリック時もパン移動できるようにする
        if (
          e.target === containerRef.current ||
          activeTool === 'pan' ||
          isSpacePressed ||
          e.button === 1 ||
          e.button === 2
        ) {
          isPanningRef.current = true
          setIsPanning(true)
          panStartRef.current = { x: e.clientX, y: e.clientY }
          panOffsetStartRef.current = { ...panOffsetRef.current }
          try {
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          } catch {}
        }
      }}
      onPointerMove={(e) => {
        if (isPanningRef.current && panStartRef.current) {
          e.preventDefault()
          const dx = e.clientX - panStartRef.current.x
          const dy = e.clientY - panStartRef.current.y
          setPanOffset({
            x: panOffsetStartRef.current.x + dx,
            y: panOffsetStartRef.current.y + dy,
          })
        }
      }}
      onPointerUp={(e) => {
        if (isPanningRef.current) {
          isPanningRef.current = false
          setIsPanning(false)
          panStartRef.current = null
          try {
            ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
          } catch {}
        }
      }}
      className={`flex-1 overflow-hidden bg-slate-950 p-8 flex items-center justify-center relative select-none ${
        isSpacePressed || activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''
      }`}
    >
      {pageImage && pageInfo ? (
        <div
          className="relative shadow-2xl rounded-sm ring-1 ring-slate-800 transition-none"
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
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
              const isEraserMode = appMode === 'draw' && activeTool === 'draw_eraser'
              const isRulerMode = appMode === 'draw' && activeTool === 'ruler'

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
                    className={`pointer-events-auto group ${
                      isEraserMode
                        ? 'cursor-pointer hover:opacity-60'
                        : isRulerMode
                        ? 'cursor-crosshair'
                        : activeTool === 'select' || isSelected
                        ? 'cursor-move'
                        : 'cursor-pointer'
                    }`}
                    onPointerDown={(e) => handleItemPointerDown(item, e)}
                    onClick={(e) => handleItemClick(item, e)}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isRulerMode && <title>クリックしてこの直線の長さを自動計測</title>}
                    {isEraserMode && <title>クリックして削除</title>}
                    {/* 透明な当たり判定バッファ（幅22pxで確実にクリック・ドラッグを拾う） */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="transparent"
                      strokeWidth={Math.max(22, item.lineWidth + 18)}
                      strokeLinecap="round"
                    />
                    {/* 選択ツール等のホバー時ガイド（触れていることがひと目で分かる淡いハイライト） */}
                    {isHovered && !isEraserMode && !isSelected && !isRulerMode && (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#38bdf8"
                        strokeWidth={item.lineWidth + 8}
                        strokeOpacity="0.35"
                        strokeLinecap="round"
                      />
                    )}
                    {/* 物差しホバー時のハイライト */}
                    {isRulerMode && isHovered && (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke={item.color || '#10b981'}
                        strokeWidth={item.lineWidth + 8}
                        strokeOpacity="0.6"
                        strokeLinecap="round"
                      />
                    )}
                    {/* 選択時の外枠ハイライト または 消しゴムホバー時の赤ハイライト */}
                    {isSelected && !isEraserMode && !isRulerMode && (
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
                    {isEraserMode && isHovered && (
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#ef4444"
                        strokeWidth={item.lineWidth + 8}
                        strokeOpacity="0.5"
                        strokeLinecap="round"
                      />
                    )}

                    {/* 直線本体 */}
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={isEraserMode && isHovered ? '#ef4444' : item.color}
                      strokeWidth={item.lineWidth * (isHovered || isSelected ? 1.3 : 1)}
                      strokeLinecap="round"
                    />

                    {/* 矢じりベクター */}
                    {arrowPath && (
                      <path
                        d={arrowPath}
                        stroke={isEraserMode && isHovered ? '#ef4444' : item.color}
                        strokeWidth={item.lineWidth * (isHovered || isSelected ? 1.3 : 1)}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}

                    {/* 選択中かつ選択ツールの移動可能バッジ */}
                    {isSelected && !isEraserMode && activeTool === 'select' && (
                      <g transform={`translate(${midX}, ${midY})`} className="pointer-events-none opacity-90 shadow-md">
                        <circle cx="0" cy="0" r="9" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                        <path d="M -4 0 L 4 0 M 0 -4 L 0 4 M -4 0 L -2 -2 M -4 0 L -2 2 M 4 0 L 2 -2 M 4 0 L 2 2 M 0 -4 L -2 -2 M 0 -4 L 2 -2 M 0 4 L -2 2 M 0 4 L 2 2" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </g>
                    )}

                    {/* 選択時・ホバー時の削除ボタン */}
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${midX + (isSelected && activeTool === 'select' ? 18 : 0)}, ${midY})`}
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
                    className={`pointer-events-auto group ${
                      isEraserMode
                        ? 'cursor-pointer hover:opacity-60'
                        : isRulerMode
                        ? 'cursor-crosshair'
                        : activeTool === 'select' || isSelected
                        ? 'cursor-move'
                        : 'cursor-pointer'
                    }`}
                    onPointerDown={(e) => handleItemPointerDown(item, e)}
                    onClick={(e) => handleItemClick(item, e)}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isRulerMode && <title>クリックしてこの矩形の面積・寸法を自動計測</title>}
                    {isEraserMode && <title>クリックして削除</title>}
                    {/* 物差しホバー時のハイライト（塗りを無くして図面を隠さない） */}
                    {isRulerMode && isHovered && (
                      <rect
                        x={rx - 4}
                        y={ry - 4}
                        width={rw + 8}
                        height={rh + 8}
                        fill="none"
                        stroke={item.color || '#10b981'}
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                        rx="4"
                      />
                    )}
                    {isSelected && !isEraserMode && !isRulerMode && (
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
                    {isEraserMode && isHovered && (
                      <rect
                        x={rx - 4}
                        y={ry - 4}
                        width={rw + 8}
                        height={rh + 8}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="3"
                        strokeDasharray="4 2"
                        rx="4"
                      />
                    )}
                    <rect
                      x={rx}
                      y={ry}
                      width={rw}
                      height={rh}
                      fill={isEraserMode && isHovered ? '#ef4444' : fillColor}
                      fillOpacity={isEraserMode && isHovered ? 0.2 : fillOpacity}
                      stroke={isEraserMode && isHovered ? '#ef4444' : item.color}
                      strokeWidth={item.lineWidth}
                    />

                    {/* 選択中かつ選択ツールの移動可能バッジ */}
                    {isSelected && !isEraserMode && activeTool === 'select' && (
                      <g transform={`translate(${rx + rw / 2}, ${ry + rh / 2})`} className="pointer-events-none opacity-90 shadow-md">
                        <circle cx="0" cy="0" r="9" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                        <path d="M -4 0 L 4 0 M 0 -4 L 0 4 M -4 0 L -2 -2 M -4 0 L -2 2 M 4 0 L 2 -2 M 4 0 L 2 2 M 0 -4 L -2 -2 M 0 -4 L 2 -2 M 0 4 L -2 2 M 0 4 L 2 2" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </g>
                    )}

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
                    className={`pointer-events-auto group ${
                      isEraserMode
                        ? 'cursor-pointer hover:opacity-60'
                        : isRulerMode
                        ? 'cursor-crosshair'
                        : activeTool === 'select' || isSelected
                        ? 'cursor-move'
                        : 'cursor-pointer'
                    }`}
                    onPointerDown={(e) => handleItemPointerDown(item, e)}
                    onClick={(e) => handleItemClick(item, e)}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isRulerMode && <title>クリックしてこの円の面積・寸法を自動計測</title>}
                    {isEraserMode && <title>クリックして削除</title>}
                    {/* 物差しホバー時のハイライト（塗りを無くして図面を隠さない） */}
                    {isRulerMode && isHovered && (
                      <ellipse
                        cx={cx}
                        cy={cy}
                        rx={rx + 4}
                        ry={ry + 4}
                        fill="none"
                        stroke={item.color || '#10b981'}
                        strokeWidth="2.5"
                        strokeDasharray="4 2"
                      />
                    )}
                    {isSelected && !isEraserMode && !isRulerMode && (
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
                    {isEraserMode && isHovered && (
                      <ellipse
                        cx={cx}
                        cy={cy}
                        rx={rx + 4}
                        ry={ry + 4}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="3"
                        strokeDasharray="4 2"
                      />
                    )}
                    <ellipse
                      cx={cx}
                      cy={cy}
                      rx={rx}
                      ry={ry}
                      fill={isEraserMode && isHovered ? '#ef4444' : fillColor}
                      fillOpacity={isEraserMode && isHovered ? 0.2 : fillOpacity}
                      stroke={isEraserMode && isHovered ? '#ef4444' : item.color}
                      strokeWidth={item.lineWidth}
                    />

                    {/* 選択中かつ選択ツールの移動可能バッジ */}
                    {isSelected && !isEraserMode && activeTool === 'select' && (
                      <g transform={`translate(${cx}, ${cy})`} className="pointer-events-none opacity-90 shadow-md">
                        <circle cx="0" cy="0" r="9" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                        <path d="M -4 0 L 4 0 M 0 -4 L 0 4 M -4 0 L -2 -2 M -4 0 L -2 2 M 4 0 L 2 -2 M 4 0 L 2 2 M 0 -4 L -2 -2 M 0 -4 L 2 -2 M 0 4 L -2 2 M 0 4 L 2 2" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </g>
                    )}

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

                // 中心座標の概算
                const avgX = (item.points.reduce((s, p) => s + p.x, 0) / item.points.length) * 1.5
                const avgY = (item.points.reduce((s, p) => s + p.y, 0) / item.points.length) * 1.5

                return (
                  <g
                    key={item.id}
                    className={`pointer-events-auto group ${
                      isEraserMode
                        ? 'cursor-pointer hover:opacity-60'
                        : isRulerMode
                        ? 'cursor-crosshair'
                        : activeTool === 'select' || isSelected
                        ? 'cursor-move'
                        : 'cursor-pointer'
                    }`}
                    onPointerDown={(e) => handleItemPointerDown(item, e)}
                    onClick={(e) => handleItemClick(item, e)}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isRulerMode && <title>クリックしてこの多角形の面積・周長を自動計測</title>}
                    {isEraserMode && <title>クリックして削除</title>}
                    {/* 透明な当たり判定バッファ（塗りなし時でも輪郭を確実にクリック可能にする） */}
                    <polygon
                      points={pts}
                      fill="transparent"
                      stroke="transparent"
                      strokeWidth={Math.max(20, item.lineWidth + 16)}
                      strokeLinejoin="round"
                    />
                    {/* 選択ツール等のホバー時ガイド */}
                    {isHovered && !isEraserMode && !isSelected && !isRulerMode && (
                      <polygon
                        points={pts}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={item.lineWidth + 6}
                        strokeOpacity="0.35"
                      />
                    )}
                    {/* 物差しホバー時のハイライト（塗りを無くして図面を隠さない） */}
                    {isRulerMode && isHovered && (
                      <polygon
                        points={pts}
                        fill="none"
                        stroke={item.color || '#10b981'}
                        strokeWidth={item.lineWidth + 6}
                        strokeOpacity="0.8"
                        strokeDasharray="4 2"
                      />
                    )}
                    {isSelected && !isEraserMode && !isRulerMode && (
                      <polygon
                        points={pts}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth={item.lineWidth + 6}
                        strokeOpacity="0.4"
                      />
                    )}
                    {isEraserMode && isHovered && (
                      <polygon
                        points={pts}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth={item.lineWidth + 6}
                        strokeOpacity="0.6"
                      />
                    )}
                    <polygon
                      points={pts}
                      fill={isEraserMode && isHovered ? '#ef4444' : fillColor}
                      fillOpacity={isEraserMode && isHovered ? 0.2 : fillOpacity}
                      stroke={isEraserMode && isHovered ? '#ef4444' : item.color}
                      strokeWidth={item.lineWidth}
                      strokeLinejoin="round"
                    />

                    {/* 選択中かつ選択ツールの移動可能バッジ */}
                    {isSelected && !isEraserMode && activeTool === 'select' && (
                      <g transform={`translate(${avgX}, ${avgY})`} className="pointer-events-none opacity-90 shadow-md">
                        <circle cx="0" cy="0" r="9" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                        <path d="M -4 0 L 4 0 M 0 -4 L 0 4 M -4 0 L -2 -2 M -4 0 L -2 2 M 4 0 L 2 -2 M 4 0 L 2 2 M 0 -4 L -2 -2 M 0 -4 L 2 -2 M 0 4 L -2 2 M 0 4 L 2 2" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                      </g>
                    )}

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
                const s = (item.fontSize || 14) * 1.5

                return (
                  <g
                    key={item.id}
                    className={`pointer-events-auto group ${
                      isEraserMode
                        ? 'cursor-pointer hover:opacity-60'
                        : activeTool === 'select' || isSelected
                        ? 'cursor-move'
                        : 'cursor-pointer'
                    }`}
                    onPointerDown={(e) => handleItemPointerDown(item, e)}
                    onClick={(e) => handleItemClick(item, e)}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    {isSelected && !isEraserMode && (
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
                    {isEraserMode && isHovered && (
                      <rect
                        x={ox - 3}
                        y={oy - 3}
                        width={s + 6}
                        height={s + 6}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2.5"
                        strokeDasharray="3 2"
                        rx="4"
                      />
                    )}
                    <path
                      d={`M ${ox + s * 0.15} ${oy + s * 0.55} L ${ox + s * 0.42} ${oy + s * 0.85} L ${ox + s * 0.9} ${oy + s * 0.18}`}
                      fill="none"
                      stroke={isEraserMode && isHovered ? '#ef4444' : item.color}
                      strokeWidth={item.lineWidth || Math.max(2.5, s * 0.12)}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />

                    {/* 選択中かつ選択ツールの移動可能バッジ */}
                    {isSelected && !isEraserMode && activeTool === 'select' && (
                      <g transform={`translate(${ox + s / 2}, ${oy + s / 2})`} className="pointer-events-none opacity-90 shadow-md">
                        <circle cx="0" cy="0" r="8" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                        <path d="M -3 0 L 3 0 M 0 -3 L 0 3" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                      </g>
                    )}

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
                const estW = estimateTextWidth(item.text, fontPx)
                const cx = tx + estW / 2
                const cy = ty - fontPx / 2
                const rot = item.rotation || 0

                return (
                  <g
                    key={item.id}
                    transform={rot ? `rotate(${rot}, ${cx}, ${cy})` : undefined}
                    className={`pointer-events-auto group ${
                      isEraserMode
                        ? 'cursor-pointer hover:opacity-60'
                        : activeTool === 'select' || isSelected
                        ? 'cursor-move'
                        : 'cursor-pointer'
                    }`}
                    onPointerDown={(e) => handleItemPointerDown(item, e)}
                    onClick={(e) => handleItemClick(item, e)}
                    onDoubleClick={(e) => handleStartEditText(item, e)}
                    onMouseEnter={() => setHoveredDrawingId(item.id)}
                    onMouseLeave={() => setHoveredDrawingId(null)}
                  >
                    <title>
                      {isEraserMode
                        ? 'クリックして削除'
                        : 'ダブルクリックで文字内容を編集'}
                    </title>
                    {item.bgWhite && (
                      <rect
                        x={tx - 3}
                        y={ty - fontPx + 2}
                        width={estW}
                        height={fontPx + 4}
                        fill="#ffffff"
                        rx="2"
                        className="shadow-sm"
                      />
                    )}
                    {isSelected && !isEraserMode && (
                      <rect
                        x={tx - 4}
                        y={ty - fontPx}
                        width={estW + 2}
                        height={fontPx + 8}
                        fill="none"
                        stroke="#38bdf8"
                        strokeWidth="2"
                        strokeDasharray="3 2"
                        rx="3"
                      />
                    )}
                    {isEraserMode && isHovered && (
                      <rect
                        x={tx - 4}
                        y={ty - fontPx}
                        width={estW + 2}
                        height={fontPx + 8}
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="2.5"
                        strokeDasharray="3 2"
                        rx="3"
                      />
                    )}
                    <text
                      x={tx}
                      y={ty}
                      fill={isEraserMode && isHovered ? '#ef4444' : item.color}
                      fontSize={fontPx}
                      fontFamily="system-ui, -apple-system, sans-serif"
                      fontWeight="bold"
                    >
                      {item.text}
                    </text>

                    {/* 選択中かつ選択ツールの移動可能バッジ */}
                    {isSelected && !isEraserMode && activeTool === 'select' && (
                      <g transform={`translate(${cx}, ${cy})`} className="pointer-events-none opacity-90 shadow-md">
                        <circle cx="0" cy="0" r="8" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                        <path d="M -3 0 L 3 0 M 0 -3 L 0 3" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" fill="none" />
                      </g>
                    )}

                    {/* 選択中の自由回転ハンドル（上部） */}
                    {isSelected && !isEraserMode && (
                      <g
                        transform={`translate(${cx}, ${ty - fontPx})`}
                        className="cursor-grab active:cursor-grabbing group/rot"
                        onPointerDown={(e) => handleRotateStart(item, e)}
                      >
                        <title>ドラッグして回転（Shiftキーで15度スナップ）</title>
                        <line x1="0" y1="0" x2="0" y2="-20" stroke="#10b981" strokeWidth="1.5" strokeDasharray="2 2" />
                        <circle cx="0" cy="-20" r="7" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" className="hover:scale-125 transition transform shadow-md" />
                        <path d="M -3 -20 A 3 3 0 1 1 3 -20" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                        <path d="M 2 -22 L 4 -20 L 2 -18" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}

                    {/* 選択時のクイック90°回転ボタン（右横） */}
                    {isSelected && !isEraserMode && (
                      <g
                        transform={`translate(${tx + estW + 10}, ${ty - fontPx / 2})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          const nextRot = ((item.rotation || 0) + 90) % 360
                          onUpdateDrawing?.(item.id, { rotation: nextRot }, true)
                        }}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <title>90度回転</title>
                        <circle cx="0" cy="0" r="9" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                        <path d="M -3.5 0 A 3.5 3.5 0 1 1 3.5 0" fill="none" stroke="#ffffff" strokeWidth="1.2" />
                        <path d="M 2 -2.5 L 4.5 0 L 2 2.5" fill="none" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      </g>
                    )}

                    {/* 選択時のテキスト編集ボタン（✏️ 編集） */}
                    {isSelected && !isEraserMode && (
                      <g
                        transform={`translate(${tx + estW + 30}, ${ty - fontPx / 2})`}
                        onClick={(e) => handleStartEditText(item, e)}
                        className="cursor-pointer hover:scale-125 transition transform"
                      >
                        <title>テキスト内容を編集（ダブルクリックでも編集可能）</title>
                        <circle cx="0" cy="0" r="9" fill="#0284c7" stroke="#ffffff" strokeWidth="1.5" />
                        {/* 鉛筆アイコン */}
                        <path
                          d="M -3 3 L 1.5 -1.5 L 3 -0 L -1.5 4.5 Z M -4.5 4.5 L -3 4 L -4 3 Z"
                          fill="#ffffff"
                        />
                      </g>
                    )}

                    {/* 選択時・ホバー時の削除ボタン */}
                    {(isHovered || isSelected) && (
                      <g
                        transform={`translate(${tx - 12}, ${ty - fontPx / 2})`}
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

            {/* 物差し面積計測中のリアルタイムガイド線 */}
            {appMode === 'draw' &&
              activeTool === 'ruler' &&
              rulerMeasureMode === 'area' &&
              rulerAreaPoints.length > 0 && (
                <g>
                  <polygon
                    points={rulerAreaPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="#10b981"
                    fillOpacity={0.15}
                    stroke="#10b981"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                  />
                  {mousePos && (
                    <line
                      x1={rulerAreaPoints[rulerAreaPoints.length - 1].x}
                      y1={rulerAreaPoints[rulerAreaPoints.length - 1].y}
                      x2={mousePos.x}
                      y2={mousePos.y}
                      stroke="#10b981"
                      strokeWidth={2}
                      strokeDasharray="2 2"
                    />
                  )}
                  {rulerAreaPoints.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={idx === 0 ? 6 : 4}
                      fill={idx === 0 ? '#10b981' : '#34d399'}
                      stroke="#ffffff"
                      strokeWidth="1.5"
                    />
                  ))}
                </g>
              )}

            {/* ドラッグ中のプレビュー描画（矢印、直線、矩形、丸、物差し） */}
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
                    {arrowHead !== 'none' && (
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
                {/* 物差しドラッグ中のリアルタイムプレビュー */}
                {activeTool === 'ruler' && (() => {
                  const x1 = dragPreview.startX
                  const y1 = dragPreview.startY
                  const x2 = dragPreview.currentX
                  const y2 = dragPreview.currentY
                  const dx = x2 - x1
                  const dy = y2 - y1
                  const len = Math.hypot(dx, dy)
                  if (len < 2) return null

                  const distPt = len / 1.5
                  const distMm = (distPt * (25.4 / 72)).toFixed(1)

                  const barLen = 14
                  const nx = (-dy / len) * (barLen / 2)
                  const ny = (dx / len) * (barLen / 2)

                  const midX = (x1 + x2) / 2
                  const midY = (y1 + y2) / 2

                  return (
                    <g>
                      <line
                        x1={x1}
                        y1={y1}
                        x2={x2}
                        y2={y2}
                        stroke="#10b981"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                      />
                      <line
                        x1={x1 - nx}
                        y1={y1 - ny}
                        x2={x1 + nx}
                        y2={y1 + ny}
                        stroke="#10b981"
                        strokeWidth="2"
                      />
                      <line
                        x1={x2 - nx}
                        y1={y2 - ny}
                        x2={x2 + nx}
                        y2={y2 + ny}
                        stroke="#10b981"
                        strokeWidth="2"
                      />
                      <circle cx={x1} cy={y1} r="3" fill="#10b981" />
                      <circle cx={x2} cy={y2} r="3" fill="#10b981" />

                      <g transform={`translate(${midX}, ${midY - 14})`}>
                        {(() => {
                          const distMmNum = parseFloat(distMm)
                          const { realStr } = formatRealDistance(distMmNum, rulerScale)
                          const label = realStr
                          return (
                            <>
                              <rect
                                x="-55"
                                y="-11"
                                width="110"
                                height="22"
                                rx="4"
                                fill="#0f172a"
                                stroke="#10b981"
                                strokeWidth="1.5"
                                className="shadow-lg"
                              />
                              <text
                                x="0"
                                y="4"
                                fill="#34d399"
                                fontSize="11"
                                fontWeight="bold"
                                textAnchor="middle"
                                fontFamily="ui-monospace, monospace"
                              >
                                {label}
                              </text>
                            </>
                          )
                        })()}
                      </g>
                    </g>
                  )
                })()}
              </g>
            )}

            {/* 確定した物差しの寸法線または面積枠表示 */}
            {rulerResult && (() => {
              const highlightColor = rulerResult.color || '#10b981'

              if (rulerResult.type === 'distance') {
                const { x1 = 0, y1 = 0, x2 = 0, y2 = 0 } = rulerResult
                const dx = x2 - x1
                const dy = y2 - y1
                const len = Math.hypot(dx, dy)
                if (len < 2) return null

                const barLen = 16
                const nx = (-dy / len) * (barLen / 2)
                const ny = (dx / len) * (barLen / 2)
                const arrowPath = getArrowHeadPath(x1, y1, x2, y2, 2, 'both')

                return (
                  <g className="pointer-events-auto">
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={highlightColor}
                      strokeWidth="6"
                      strokeOpacity="0.2"
                    />
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke={highlightColor}
                      strokeWidth="2"
                    />
                    <line
                      x1={x1 - nx}
                      y1={y1 - ny}
                      x2={x1 + nx}
                      y2={y1 + ny}
                      stroke={highlightColor}
                      strokeWidth="2.5"
                    />
                    <line
                      x1={x2 - nx}
                      y1={y2 - ny}
                      x2={x2 + nx}
                      y2={y2 + ny}
                      stroke={highlightColor}
                      strokeWidth="2.5"
                    />
                    {arrowPath && (
                      <path
                        d={arrowPath}
                        stroke={highlightColor}
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    )}
                    <circle cx={x1} cy={y1} r="3" fill={highlightColor} />
                    <circle cx={x2} cy={y2} r="3" fill={highlightColor} />
                  </g>
                )
              } else if (rulerResult.type === 'area' && rulerResult.points) {
                return (
                  <g className="pointer-events-auto">
                    <polygon
                      points={rulerResult.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={highlightColor}
                      strokeWidth={2.5}
                      strokeDasharray="5 3"
                    />
                    {rulerResult.points.map((p, idx) => (
                      <circle
                        key={idx}
                        cx={p.x}
                        cy={p.y}
                        r="3.5"
                        fill={highlightColor}
                        stroke="#ffffff"
                        strokeWidth="1.5"
                      />
                    ))}
                  </g>
                )
              }
              return null
            })()}

            {/* 線への吸着ガイド表示（スマートマグネット） */}
            {snapGuide && (
              <g className="pointer-events-none animate-fade-in">
                {/* 線の中心とテキスト吸着位置を結ぶ点線 */}
                <line
                  x1={snapGuide.midX}
                  y1={snapGuide.midY}
                  x2={snapGuide.targetX}
                  y2={snapGuide.targetY}
                  stroke="#10b981"
                  strokeWidth="2"
                  strokeDasharray="3 3"
                />
                {/* 線の中点マーカー */}
                <circle cx={snapGuide.midX} cy={snapGuide.midY} r="4" fill="#10b981" stroke="#ffffff" strokeWidth="1.5" />
                {/* 吸着ターゲットマーカー */}
                <circle cx={snapGuide.targetX} cy={snapGuide.targetY} r="5" fill="#34d399" stroke="#ffffff" strokeWidth="1.5" />
                {/* 角度同期バッジ */}
                <g transform={`translate(${snapGuide.targetX}, ${snapGuide.targetY - 14})`}>
                  <rect x="-42" y="-10" width="84" height="20" rx="4" fill="#064e3b" stroke="#34d399" strokeWidth="1" className="shadow-lg" />
                  <text x="0" y="4" fill="#34d399" fontSize="10" fontWeight="bold" textAnchor="middle" fontFamily="ui-monospace, monospace">
                    🧲 {snapGuide.angle}° 吸着
                  </text>
                </g>
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
            onContextMenu={(e) => e.preventDefault()}
            onPointerCancel={() => {
              isDraggingRef.current = false
              dragStartRef.current = null
              dragCurrentRef.current = null
              setDragPreview(null)
              isPanningRef.current = false
              setIsPanning(false)
              panStartRef.current = null
            }}
            className={`absolute inset-0 select-none z-10 ${getCursorClass()}`}
            title={
              isSpacePressed || activeTool === 'pan'
                ? 'ドラッグして用紙を自由に移動（スクロール）'
                : appMode === 'eraser'
                ? 'マウスドラッグで消去したい範囲を囲んでください'
                : activeTool === 'select'
                ? '描画オブジェクトをクリックまたはドラッグして移動できます（Deleteキーで削除）'
                : activeTool === 'ruler'
                ? 'ドラッグして2点間の実寸(mm)・ピクセル・角度を計測します（Shiftキーで水平・垂直固定）'
                : activeTool === 'text'
                ? 'クリックしてテキストを入力'
                : activeTool === 'polygon'
                ? 'クリックで頂点を結び、始点クリックまたはダブルクリックで完了'
                : activeTool === 'check'
                ? 'クリックしてチェックマークを配置'
                : activeTool === 'draw_eraser'
                ? '画面上の描画オブジェクトをクリックすると即座に消去できます'
                : 'ドラッグして描画（Shiftキーで水平・垂直・正円・正方形に固定）'
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

          {/* 物差し確定時の計測結果・図面反映ポップアップバッジ */}
          {rulerResult && (() => {
            const pos =
              rulerResult.type === 'distance'
                ? {
                    left: `${((rulerResult.x1 ?? 0) + (rulerResult.x2 ?? 0)) / 2}px`,
                    top: `${((rulerResult.y1 ?? 0) + (rulerResult.y2 ?? 0)) / 2}px`,
                  }
                : {
                    left: `${rulerResult.center?.x ?? 0}px`,
                    top: `${rulerResult.center?.y ?? 0}px`,
                  }

            return (
              <div
                style={{
                  ...pos,
                  transform: 'translate(-50%, -120%)',
                }}
                onClick={(e) => e.stopPropagation()}
                className="absolute z-30 bg-slate-900/95 border-2 border-emerald-500 rounded-xl px-3 py-2 shadow-2xl flex items-center gap-3 backdrop-blur-md animate-fade-in ring-2 ring-emerald-500/20 max-w-sm"
              >
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    {rulerResult.type === 'distance' ? (
                      <Ruler className="w-4 h-4" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    {rulerResult.type === 'distance' ? (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-bold text-emerald-300 font-mono tracking-tight">
                            {rulerResult.realLengthStr}
                          </span>
                        </div>
                        {rulerResult.angleDeg !== undefined && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            角度: {rulerResult.angleDeg}°
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-bold text-emerald-300 font-mono tracking-tight">
                            A = {rulerResult.realAreaStr}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="h-8 w-[1px] bg-slate-700 shrink-0" />

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={handleBakeRulerToDrawing}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 text-[11px] shadow-sm transition transform active:scale-95 cursor-pointer"
                    title={
                      rulerResult.type === 'distance'
                        ? 'この寸法線と数値を校正描画として図面に書き残します'
                        : 'この面積枠と平米数ラベルを校正描画として図面に書き残します'
                    }
                  >
                    <ArrowRight className="w-3 h-3" />
                    図面に残す
                  </button>
                  <button
                    onClick={() => setRulerResult(null)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
                    title="計測バッジを閉じる"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })()}

          {/* テキスト入力ポップアップ (白基調・高コントラストUI) */}
          {textInput && (
            <div
              style={{
                left: `${textInput.x}px`,
                top: `${textInput.y}px`,
              }}
              onClick={(e) => e.stopPropagation()}
              className="absolute z-30 bg-white border border-slate-300 p-3 rounded-xl shadow-2xl flex flex-col gap-2.5 min-w-[280px] animate-fade-in ring-4 ring-black/10"
            >
              <div className="text-xs font-bold text-slate-800 flex items-center justify-between border-b border-slate-100 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-blue-600" />
                  <span>{textInput.editingId ? 'テキストの編集' : '文字・校正テキストの入力'}</span>
                </span>
                <span className="text-slate-400 text-[11px] font-mono">({fontSize}pt)</span>
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
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 focus:outline-none font-medium transition"
                style={{ color: drawColor }}
              />
              <div className="flex items-center justify-between text-xs text-slate-600 pt-0.5">
                <label className="flex items-center gap-1.5 cursor-pointer hover:text-slate-900 transition">
                  <input
                    type="checkbox"
                    checked={textInput.bgWhite}
                    onChange={(e) =>
                      setTextInput({ ...textInput, bgWhite: e.target.checked })
                    }
                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] font-medium">背景を白で隠す</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setTextInput({
                        ...textInput,
                        rotation: ((textInput.rotation || 0) + 90) % 360,
                      })
                    }
                    className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold flex items-center gap-1 cursor-pointer transition border border-slate-200"
                    title="テキストを90度回転"
                  >
                    <RotateCw className="w-3 h-3 text-emerald-600" />
                    <span>{textInput.rotation || 0}°</span>
                  </button>
                  <button
                    onClick={() => setTextInput(null)}
                    className="px-2 py-1 rounded-md text-slate-500 hover:text-slate-800 text-[11px] font-medium hover:bg-slate-100 transition cursor-pointer"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmText}
                    className="px-3 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center gap-1 text-[11px] shadow-sm transition active:scale-95 cursor-pointer"
                  >
                    <CornerDownLeft className="w-3 h-3" />
                    {textInput.editingId ? '更新' : '決定'}
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
              const isRulerMode = appMode === 'draw' && activeTool === 'ruler'

              return (
                <div
                  key={r.id}
                  style={style}
                  onClick={(e) => {
                    if (isRulerMode) {
                      e.stopPropagation()
                      handleMeasureRedaction(r)
                    }
                  }}
                  title={
                    isRulerMode
                      ? 'クリックしてこの墨消し枠の面積・寸法を自動計測'
                      : undefined
                  }
                  className={`absolute pointer-events-auto group border transition-all duration-100 ${
                    isRulerMode
                      ? 'cursor-crosshair hover:ring-2 hover:ring-emerald-400 hover:border-emerald-400'
                      : ''
                  } ${
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
