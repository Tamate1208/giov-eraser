export type AppMode = 'eraser' | 'draw'

export type RulerMeasureMode = 'distance' | 'area'

export type DrawingTool =
  | 'pan'
  | 'select'
  | 'text'
  | 'line'
  | 'rect'
  | 'polygon'
  | 'circle'
  | 'check'
  | 'ruler'
  | 'draw_eraser'
  | 'arrow'

export type FillMode = 'none' | 'semi' | 'solid'

export type ArrowHead = 'end' | 'start' | 'both' | 'none'

export interface Point {
  x: number
  y: number
}

export interface DrawingItem {
  id: string
  pageIndex: number
  tool: DrawingTool
  color: string
  fillColor?: string
  fillMode: FillMode
  lineWidth: number
  fontSize: number
  // 矢印用
  arrowHead?: ArrowHead
  // テキスト用
  text?: string
  bgWhite?: boolean
  rotation?: number // 回転角度 (0〜360度)
  // 矩形・丸・テキスト・チェックのバウンディングボックス (PDF座標系: 左上原点)
  x?: number
  y?: number
  w?: number
  h?: number
  // 直線・矢印・多角形用の頂点群 (PDF座標系: 左上原点)
  points?: Point[]
}

// しおり（目次 / ブックマーク）アイテム
export interface BookmarkItem {
  id: string
  title: string
  page: number // 0-based page index
  children?: BookmarkItem[]
  isOpen?: boolean
}

// 元に戻す (Undo) 用の履歴アクション
export type HistoryAction =
  | { type: 'add_redaction'; redactionId: string }
  | { type: 'add_redactions'; redactionIds: string[] }
  | { type: 'remove_redaction'; redaction: any }
  | { type: 'add_drawing'; drawingId: string }
  | { type: 'remove_drawing'; drawing: DrawingItem }
  | { type: 'move_drawing'; id: string; prev: Partial<DrawingItem> }
  | { type: 'clear_page'; redactions: any[]; drawings: DrawingItem[] }
  | { type: 'clear_all'; redactions: any[]; drawings: DrawingItem[] }

