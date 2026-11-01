import { DeskDoc, DeskItem } from '../types/desk'
import { renderPageImage, getPdfInfo, getMuPdf } from './mupdfService'

/**
 * 外部PDFファイルからDeskDocを作成し、全ページまたは特定ページのDeskItem群を生成
 */
export async function createDeskItemsFromPdfFile(
  file: File,
  docId: string
): Promise<{ doc: DeskDoc; items: DeskItem[] }> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const info = await getPdfInfo(bytes)

  const doc: DeskDoc = {
    id: docId,
    name: file.name,
    bytes,
    pageCount: info.numPages,
  }

  const items: DeskItem[] = []
  for (let i = 0; i < info.numPages; i++) {
    const page = info.pages[i]
    items.push({
      id: `${docId}_p${i}_${Math.random().toString(36).substring(2, 7)}`,
      docId,
      docName: file.name,
      pageIndex: i,
      pageNumber: i + 1,
      rotation: 0,
      widthPt: page.width,
      heightPt: page.height,
    })
  }

  return { doc, items }
}

/**
 * サムネイルを遅延生成
 */
export async function generateDeskItemThumbnail(
  docBytes: Uint8Array,
  pageIndex: number,
  rotation: number = 0
): Promise<string> {
  try {
    return await renderPageImage(docBytes, pageIndex, 0.3, rotation)
  } catch (err) {
    console.error('Thumbnail generation failed:', err)
    return ''
  }
}

/**
 * 作業机上のアイテム群から新しい単一のPDFをMuPDFネイティブ移植で高速・高精度に編纂・結合
 */
export async function buildMergedPdfFromDesk(
  items: DeskItem[],
  docsMap: Map<string, DeskDoc>
): Promise<Uint8Array> {
  const m = await getMuPdf()
  const newDoc = new m.PDFDocument()
  const openDocs = new Map<string, any>()

  for (const item of items) {
    const docMeta = docsMap.get(item.docId)
    if (!docMeta) {
      console.warn(`Doc not found for item:`, item)
      continue
    }

    let srcDoc = openDocs.get(item.docId)
    if (!srcDoc) {
      srcDoc = m.Document.openDocument(docMeta.bytes, 'application/pdf')
      openDocs.set(item.docId, srcDoc)
    }

    if (item.pageIndex >= 0 && item.pageIndex < srcDoc.countPages()) {
      const newPageIdx = newDoc.countPages()
      newDoc.graftPage(newPageIdx, srcDoc, item.pageIndex)

      if (item.rotation !== 0) {
        const lastPage = newDoc.loadPage(newPageIdx)
        let baseRot = 0
        try {
          const rotObj = lastPage.getObject().get('Rotate')
          if (rotObj && !rotObj.isNull()) baseRot = rotObj.asNumber() || 0
        } catch {}
        const finalRot = (((baseRot + item.rotation) % 360) + 360) % 360
        lastPage.getObject().put('Rotate', newDoc.newInteger(finalRot))
        lastPage.destroy()
      }
    }
  }

  const outBuf = newDoc.saveToBuffer('clean,garbage')
  const u8 = new Uint8Array(outBuf.asUint8Array())
  try {
    outBuf.destroy()
    newDoc.destroy()
    for (const d of openDocs.values()) {
      d.destroy()
    }
  } catch {}
  return u8
}
