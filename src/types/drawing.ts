export type AppMode = 'eraser' | 'draw'

export type DrawingTool = 'text' | 'arrow' | 'line' | 'rect' | 'polygon' | 'check' | 'circle'

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
  // 矩形・丸・テキスト・チェックのバウンディングボックス (PDF座標系: 左上原点)
  x?: number
  y?: number
  w?: number
  h?: number
  // 直線・矢印・多角形用の頂点群 (PDF座標系: 左上原点)
  points?: Point[]
}

// 元に戻す (Undo) 用の履歴アクション
export type HistoryAction =
  | { type: 'add_redaction'; redactionId: string }
  | { type: 'add_redactions'; redactionIds: string[] }
  | { type: 'remove_redaction'; redaction: any }
  | { type: 'add_drawing'; drawingId: string }
  | { type: 'remove_drawing'; drawing: DrawingItem }
  | { type: 'clear_page'; redactions: any[]; drawings: DrawingItem[] }
  | { type: 'clear_all'; redactions: any[]; drawings: DrawingItem[] }

