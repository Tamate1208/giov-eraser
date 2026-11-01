export interface DeskDoc {
  id: string
  name: string
  bytes: Uint8Array
  pageCount: number
}

export interface DeskItem {
  id: string
  docId: string
  docName: string
  pageIndex: number // 0-based
  pageNumber: number // 1-based
  thumbnail?: string
  rotation: number // 0, 90, 180, 270
  widthPt?: number
  heightPt?: number
}
