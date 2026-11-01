import { PDFDocument, degrees } from 'pdf-lib'
import { DeskDoc, DeskItem } from '../types/desk'
import { renderPageImage, getPdfInfo } from './mupdfService'

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
 * 作業机上のアイテム群から新しい単一のPDFを編纂・結合して生成
 */
export async function buildMergedPdfFromDesk(
  items: DeskItem[],
  docsMap: Map<string, DeskDoc>
): Promise<Uint8Array> {
  const mergedDoc = await PDFDocument.create()
  const parsedDocs = new Map<string, PDFDocument>()

  for (const item of items) {
    const docMeta = docsMap.get(item.docId)
    if (!docMeta) continue

    let srcDoc = parsedDocs.get(item.docId)
    if (!srcDoc) {
      srcDoc = await PDFDocument.load(docMeta.bytes, { ignoreEncryption: true })
      parsedDocs.set(item.docId, srcDoc)
    }

    if (item.pageIndex < 0 || item.pageIndex >= srcDoc.getPageCount()) continue

    const [copiedPage] = await mergedDoc.copyPages(srcDoc, [item.pageIndex])
    if (item.rotation) {
      const currentRot = copiedPage.getRotation().angle
      copiedPage.setRotation(degrees((currentRot + item.rotation) % 360))
    }
    mergedDoc.addPage(copiedPage)
  }

  return await mergedDoc.save()
}
