import { GZIPPED_MUPDF_WASM_BASE64 } from './wasmBinary';
import { DrawingItem, BookmarkItem } from '../types/drawing';

let mupdfModule: any = null;
let initPromise: Promise<any> | null = null;

// Base64からGzipを解凍してUint8Arrayに復元
async function decompressGzipBase64(base64: string): Promise<Uint8Array> {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Web標準の DecompressionStream を使用 (Chrome, Edge, Safari, Firefox すべてサポート)
  const ds = new DecompressionStream('gzip');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();

  const response = new Response(ds.readable);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

// Wasm メモリのビューから JS の独立した TypedArray に安全にクローン（Wasmヒープ拡張時の Detached ArrayBuffer を防止）
function toSafeUint8Array(buf: any): Uint8Array {
  const u8 = buf.asUint8Array();
  const copy = new Uint8Array(u8);
  try {
    buf.destroy();
  } catch {}
  return copy;
}

export async function getMuPdf() {
  if (mupdfModule) return mupdfModule;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    // 1. Wasm バイナリの展開
    const wasmBytes = await decompressGzipBase64(GZIPPED_MUPDF_WASM_BASE64);

    // 2. MuPDF の初期化モジュールに渡す
    (globalThis as any).$libmupdf_wasm_Module = {
      wasmBinary: wasmBytes.buffer,
    };

    // 3. mupdf のロード
    const m = await import('mupdf');
    mupdfModule = m;
    return m;
  })();

  return initPromise;
}

export interface RedactRect {
  id: string;
  x0: number; // PDF座標系 (左下原点, ポイント単位)
  y0: number;
  x1: number;
  y1: number;
  pageIndex: number;
  color?: 'black' | 'white';
}

export interface PdfPageInfo {
  index: number;
  width: number;
  height: number;
  rotation: number;
}

export interface HubSignatureInfo {
  timestamp: string;
  operation: string;
  version: string;
}

export interface PdfDocumentInfo {
  numPages: number;
  pages: PdfPageInfo[];
  hubSignature?: HubSignatureInfo | null;
}

/**
 * 出力PDFの内部辞書（/Root および 各ページの /PieceInfo 風キー）に
 * 外見・印刷・マウス選択・一般プロパティに一切現れないステルス刻印を書き込む
 */
export function stampHubSignature(doc: any, operation: string): void {
  try {
    const payload = JSON.stringify({
      g: 'GioV_PDF_Hub',
      v: '1.0',
      t: new Date().toISOString(),
      op: operation,
    });
    const encoded = 'GV1_' + btoa(encodeURIComponent(payload));
    const trailer = doc.getTrailer();
    const root = trailer?.get('Root');
    if (root && !root.isNull()) {
      root.put('GV_Sig', doc.newString(encoded));
    }
    const pageCount = doc.countPages();
    for (let i = 0; i < pageCount; i++) {
      const p = doc.loadPage(i);
      p.getObject()?.put('GV_Sig', doc.newString(encoded));
      p.destroy();
    }
  } catch {}
}

/**
 * PDF内部のステルス刻印（/GV_Sig）を検出・デコードする
 */
function readHubSignature(doc: any): HubSignatureInfo | null {
  try {
    let raw: string | null = null;
    const trailer = doc.getTrailer();
    const root = trailer?.get('Root');
    const rootSig = root?.get('GV_Sig');
    if (rootSig && !rootSig.isNull()) {
      raw = rootSig.asString();
    }
    if (!raw && doc.countPages() > 0) {
      const p0 = doc.loadPage(0);
      const pSig = p0.getObject()?.get('GV_Sig');
      if (pSig && !pSig.isNull()) {
        raw = pSig.asString();
      }
      p0.destroy();
    }
    if (raw && raw.startsWith('GV1_')) {
      const jsonStr = decodeURIComponent(atob(raw.slice(4)));
      const data = JSON.parse(jsonStr);
      if (data && data.g === 'GioV_PDF_Hub') {
        return {
          timestamp: data.t || '',
          operation: data.op || '出力',
          version: data.v || '1.0',
        };
      }
    }
  } catch {}
  return null;
}

/**
 * PDFのメタ情報取得（ページ回転考慮 ＆ ステルス刻印の検出）
 */
export async function getPdfInfo(
  pdfBytes: Uint8Array,
  pageRotations: Record<number, number> = {}
): Promise<PdfDocumentInfo> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const numPages = doc.countPages();
  const pages: PdfPageInfo[] = [];
  const hubSignature = readHubSignature(doc);

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i);
    const bounds = page.getBounds(); // [x0, y0, x1, y1]
    let baseRot = 0;
    try {
      const rotObj = page.getObject().get('Rotate');
      if (rotObj && !rotObj.isNull()) {
        baseRot = rotObj.asNumber() || 0;
      }
    } catch {}

    const offsetRot = pageRotations[i] || 0;
    const effectiveRot = (((baseRot + offsetRot) % 360) + 360) % 360;

    const rawW = Math.abs(bounds[2] - bounds[0]);
    const rawH = Math.abs(bounds[3] - bounds[1]);

    // 90度または270度回転のときは幅と高さを入れ替える
    const isSideways = effectiveRot === 90 || effectiveRot === 270;
    pages.push({
      index: i,
      width: isSideways ? rawH : rawW,
      height: isSideways ? rawW : rawH,
      rotation: effectiveRot,
    });
    page.destroy();
  }
  doc.destroy();

  return { numPages, pages, hubSignature };
}

/**
 * ページのプレビュー画像を生成 (PNG Data URL / ページ回転対応)
 */
export async function renderPageImage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  scale: number = 1.5,
  rotationOffset: number = 0
): Promise<string> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const page = doc.loadPage(pageIndex);

  if (rotationOffset !== 0) {
    let baseRot = 0;
    try {
      const rotObj = page.getObject().get('Rotate');
      if (rotObj && !rotObj.isNull()) baseRot = rotObj.asNumber() || 0;
    } catch {}
    const newRot = (((baseRot + rotationOffset) % 360) + 360) % 360;
    page.getObject().put('Rotate', doc.newInteger(newRot));
  }

  const matrix = m.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, m.ColorSpace.DeviceRGB, false);
  const pngBytes = new Uint8Array(pixmap.asPNG());
  pixmap.destroy();
  page.destroy();
  doc.destroy();

  const blob = new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' });
  return URL.createObjectURL(blob);
}

/**
 * 既存PDFのアウトライン（しおり）ツリーを取得
 */
export async function loadPdfBookmarks(pdfBytes: Uint8Array): Promise<BookmarkItem[]> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const outline = doc.loadOutline();
  doc.destroy();
  if (!outline || outline.length === 0) return [];

  let idCounter = 1;
  const convertItems = (items: any[]): BookmarkItem[] => {
    return items.map((it) => {
      const item: BookmarkItem = {
        id: `bm_${idCounter++}_${Date.now()}`,
        title: it.title || '無題のしおり',
        page: typeof it.page === 'number' ? it.page : 0,
        isOpen: it.open ?? true,
      };
      if (it.down && it.down.length > 0) {
        item.children = convertItems(it.down);
      }
      return item;
    });
  };

  return convertItems(outline);
}

/**
 * 複数のPDFファイルを1つに結合（マージ）
 */
export async function mergePdfFiles(
  basePdfBytes: Uint8Array,
  additionalPdfs: Uint8Array[]
): Promise<Uint8Array> {
  const m = await getMuPdf();
  const targetDoc = m.Document.openDocument(basePdfBytes, 'application/pdf');

  for (const extraBytes of additionalPdfs) {
    const srcDoc = m.Document.openDocument(extraBytes, 'application/pdf');
    const srcPageCount = srcDoc.countPages();
    for (let i = 0; i < srcPageCount; i++) {
      targetDoc.graftPage(targetDoc.countPages(), srcDoc, i);
    }
    srcDoc.destroy();
  }

  stampHubSignature(targetDoc, 'PDF追加結合');
  const out = toSafeUint8Array(targetDoc.saveToBuffer('clean,garbage'));
  targetDoc.destroy();
  return out;
}

/**
 * 指定ページだけを抽出して新しいPDFを生成（分割・抽出）
 */
export async function extractPages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
  pageRotations: Record<number, number> = {}
): Promise<Uint8Array> {
  const m = await getMuPdf();
  const srcDoc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const newDoc = new m.PDFDocument();

  const sorted = [...pageIndices].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    const pageIdx = sorted[i];
    if (pageIdx >= 0 && pageIdx < srcDoc.countPages()) {
      newDoc.graftPage(newDoc.countPages(), srcDoc, pageIdx);
      const rot = pageRotations[pageIdx] || 0;
      if (rot !== 0) {
        const lastPage = newDoc.loadPage(newDoc.countPages() - 1);
        let baseRot = 0;
        try {
          const rotObj = lastPage.getObject().get('Rotate');
          if (rotObj && !rotObj.isNull()) baseRot = rotObj.asNumber() || 0;
        } catch {}
        const finalRot = (((baseRot + rot) % 360) + 360) % 360;
        lastPage.getObject().put('Rotate', newDoc.newInteger(finalRot));
        lastPage.destroy();
      }
    }
  }

  stampHubSignature(newDoc, `ページ抽出 (${sorted.length}頁)`);
  const out = toSafeUint8Array(newDoc.saveToBuffer('clean,garbage'));
  newDoc.destroy();
  srcDoc.destroy();
  return out;
}

/**
 * 指定ページを削除したPDFを生成
 */
export async function deletePagesFromPdf(
  pdfBytes: Uint8Array,
  pageIndicesToDelete: number[]
): Promise<Uint8Array> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');

  // 降順でインデックスを削除（インデックスずれ防止）
  const descIndices = [...new Set(pageIndicesToDelete)].sort((a, b) => b - a);
  for (const idx of descIndices) {
    if (idx >= 0 && idx < doc.countPages()) {
      doc.deletePage(idx);
    }
  }

  stampHubSignature(doc, 'ページ削除編集');
  const out = toSafeUint8Array(doc.saveToBuffer('clean,garbage'));
  doc.destroy();
  return out;
}

/**
 * ページ内テキスト検索（キーワード一括消しゴム用）
 */
export async function searchPageKeyword(
  pdfBytes: Uint8Array,
  pageIndex: number,
  keyword: string
): Promise<Array<[number, number, number, number]>> {
  if (!keyword.trim()) return [];
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const page = doc.loadPage(pageIndex);

  const hits = page.search(keyword);
  const bounds = page.getBounds();
  page.destroy();
  doc.destroy();
  const pageW = bounds[2] - bounds[0];
  const pageH = bounds[3] - bounds[1];
  const rects: Array<[number, number, number, number]> = [];

  for (const hit of hits) {
    for (const q of hit) {
      // Quad [ulx, uly, urx, ury, llx, lly, lrx, lry] - MuPDFは左上原点 (0, 0)
      const rawX0 = Math.min(q[0], q[4]);
      const rawY0 = Math.min(q[1], q[3]);
      const rawX1 = Math.max(q[2], q[6]);
      const rawY1 = Math.max(q[5], q[7]);

      // 視認性と墨消し漏れ防止のため余白を付与し、ページ枠内にクランプ
      const x0 = Math.max(0, rawX0 - 2);
      const y0 = Math.max(0, rawY0 - 2);
      const x1 = Math.min(pageW, rawX1 + 2);
      const y1 = Math.min(pageH, rawY1 + 2);

      rects.push([x0, y0, x1, y1]);
    }
  }

  return rects;
}

/**
 * 指定矩形領域内にあるテキスト行の精密なバウンディングボックスを抽出（テキスト吸着選択用）
 */
export async function extractTextRectsInBBox(
  pdfBytes: Uint8Array,
  pageIndex: number,
  bbox: [number, number, number, number]
): Promise<Array<[number, number, number, number]>> {
  const [rx0, ry0, rx1, ry1] = bbox;
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const page = doc.loadPage(pageIndex);
  const textPage = page.toStructuredText();
  const json = JSON.parse(textPage.asJSON());
  const bounds = page.getBounds();
  textPage.destroy();
  page.destroy();
  doc.destroy();
  const pageW = bounds[2] - bounds[0];
  const pageH = bounds[3] - bounds[1];
  const rects: Array<[number, number, number, number]> = [];

  for (const block of json.blocks) {
    if (block.type !== 'text') continue;
    for (const line of block.lines) {
      const lx0 = line.bbox.x;
      const ly0 = line.bbox.y;
      const lx1 = lx0 + line.bbox.w;
      const ly1 = ly0 + line.bbox.h;

      // 重なり (交差) 判定
      const ix0 = Math.max(rx0, lx0);
      const iy0 = Math.max(ry0, ly0);
      const ix1 = Math.min(rx1, lx1);
      const iy1 = Math.min(ry1, ly1);

      // 交差判定
      if (ix1 - ix0 >= 2 && iy1 - iy0 >= 2) {
        rects.push([
          Math.max(0, ix0 - 2),
          Math.max(0, ly0 - 2),
          Math.min(pageW, ix1 + 2),
          Math.min(pageH, iy1 + 2),
        ]);
      }
    }
  }

  return rects;
}

// 16進カラーコード (#ef4444等) を [r, g, b] (0〜1) に変換
function hexToRgb(hex: string): [number, number, number] {
  let c = hex.replace('#', '')
  if (c.length === 3) {
    c = c.split('').map((x) => x + x).join('')
  }
  const num = parseInt(c, 16) || 0
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ]
}

/**
 * しおり（目次）ツリーをPDFディクショナリとして構築するヘルパー
 */
function buildOutlinesDict(doc: any, bookmarks: BookmarkItem[]): any {
  if (!bookmarks || bookmarks.length === 0) return null;

  const outlinesRef = doc.createObject();
  const outlinesDict = doc.newDictionary();
  outlinesDict.put('Type', doc.newName('Outlines'));

  const buildItems = (
    items: BookmarkItem[],
    parentRef: any
  ): { first: any; last: any; count: number } => {
    let firstRef: any = null;
    let lastRef: any = null;
    let prevRef: any = null;
    let prevDict: any = null;
    let totalCount = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemRef = doc.createObject();
      const itemDict = doc.newDictionary();

      if (!firstRef) firstRef = itemRef;
      lastRef = itemRef;

      itemDict.put('Title', doc.newString(item.title));
      itemDict.put('Parent', parentRef);

      if (prevRef && prevDict) {
        prevDict.put('Next', itemRef);
        itemDict.put('Prev', prevRef);
      }

      // リンク先ページ [pageObj /Fit]
      const pageIdx = Math.max(0, Math.min(doc.countPages() - 1, item.page));
      const pageObj = doc.loadPage(pageIdx).getObject();
      const dest = doc.newArray();
      dest.push(pageObj);
      dest.push(doc.newName('Fit'));
      itemDict.put('Dest', dest);

      totalCount++;

      if (item.children && item.children.length > 0) {
        const sub = buildItems(item.children, itemRef);
        if (sub.first) {
          itemDict.put('First', sub.first);
          itemDict.put('Last', sub.last);
          itemDict.put('Count', doc.newInteger(sub.count));
          totalCount += sub.count;
        }
      }

      if (prevRef && prevDict) {
        prevRef.writeObject(prevDict);
      }
      prevRef = itemRef;
      prevDict = itemDict;
    }

    if (prevRef && prevDict) {
      prevRef.writeObject(prevDict);
    }

    return { first: firstRef, last: lastRef, count: totalCount };
  };

  const rootResult = buildItems(bookmarks, outlinesRef);
  if (rootResult.first) {
    outlinesDict.put('First', rootResult.first);
    outlinesDict.put('Last', rootResult.last);
    outlinesDict.put('Count', doc.newInteger(rootResult.count));
    outlinesRef.writeObject(outlinesDict);
    return outlinesRef;
  }
  return null;
}

/**
 * 完全不可逆墨消し（Redaction）および描画・校正オブジェクトの合成実行
 * ページ回転・しおりツリーの更新も統合してクリーンPDFを生成する
 */
export async function applyRedactions(
  pdfBytes: Uint8Array,
  redactions: RedactRect[],
  defaultColor: 'black' | 'white' = 'black',
  drawings: DrawingItem[] = [],
  pageRotations: Record<number, number> = {},
  bookmarks: BookmarkItem[] = []
): Promise<Uint8Array> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const numPages = doc.countPages();

  const redactPageMap = new Map<number, RedactRect[]>();
  for (const r of redactions) {
    const list = redactPageMap.get(r.pageIndex) || [];
    list.push(r);
    redactPageMap.set(r.pageIndex, list);
  }

  const drawPageMap = new Map<number, DrawingItem[]>();
  for (const d of drawings) {
    const list = drawPageMap.get(d.pageIndex) || [];
    list.push(d);
    drawPageMap.set(d.pageIndex, list);
  }

  // 各ページの処理（ページ回転・物理墨消し切除 ＆ 墨消し矩形・描画オブジェクトのContents直接ベイク）
  for (let i = 0; i < numPages; i++) {
    const rectList = redactPageMap.get(i) || [];
    const drawList = drawPageMap.get(i) || [];
    const hasRotation = !!pageRotations[i];

    if (rectList.length === 0 && drawList.length === 0 && !hasRotation) continue;

    const page = doc.loadPage(i);
    const pageObj = page.getObject();

    // ページの回転を適用
    if (hasRotation) {
      let baseRot = 0;
      try {
        const rotObj = pageObj.get('Rotate');
        if (rotObj && !rotObj.isNull()) baseRot = rotObj.asNumber() || 0;
      } catch {}
      const finalRot = (((baseRot + pageRotations[i]) % 360) + 360) % 360;
      pageObj.put('Rotate', doc.newInteger(finalRot));
    }

    if (rectList.length === 0 && drawList.length === 0) continue;
    const bounds = page.getBounds();

    // 画面座標 (左上原点) から PDF 座標 (左下原点) への変換ヘルパー
    const toPdfX = (x: number) => bounds[0] + x;
    const toPdfY = (y: number) => bounds[3] - y;

    // 1. 墨消し物理切除（テキスト・画像ストリームの不可逆物理削除）
    if (rectList.length > 0) {
      for (const r of rectList) {
        const annot = page.createAnnotation('Redact');
        annot.setRect([r.x0, r.y0, r.x1, r.y1]);
      }
      // black_boxes = false で実行！エンジンによる黒ボックス強制描画を停止し、物理切除のみを行う
      page.applyRedactions(false);
    }

    let hasSemi = false;
    let stream = '';

    // 2. 墨消し矩形の下地焼き込み（白塗りは純白 1 1 1、黒塗りは漆黒 0 0 0）
    for (const r of rectList) {
      const isWhite = (r.color || defaultColor) === 'white';
      const col = isWhite ? '1 1 1' : '0 0 0';
      const rx = toPdfX(r.x0).toFixed(2);
      const ry = toPdfY(r.y1).toFixed(2);
      const rw = (r.x1 - r.x0).toFixed(2);
      const rh = (r.y1 - r.y0).toFixed(2);

      stream += 'q\n';
      stream += `${col} rg ${col} RG\n`;
      stream += `${rx} ${ry} ${rw} ${rh} re f\n`;
      stream += 'Q\n';
    }

    // 3. 描画・校正アイテムの合成適用（白塗り等の下地の上に確実に描画）
    for (const d of drawList) {
      const rgb = hexToRgb(d.color);
      const rStr = rgb[0].toFixed(3);
      const gStr = rgb[1].toFixed(3);
      const bStr = rgb[2].toFixed(3);

      if (d.tool === 'arrow' || d.tool === 'line') {
        if (!d.points || d.points.length < 2) continue;
        const x1 = d.points[0].x;
        const y1 = d.points[0].y;
        const x2 = d.points[1].x;
        const y2 = d.points[1].y;
        const lw = d.lineWidth || 2;

        stream += 'q\n';
        stream += `${rStr} ${gStr} ${bStr} RG 1 J 1 j ${lw} w\n`;
        stream += `${toPdfX(x1).toFixed(2)} ${toPdfY(y1).toFixed(2)} m ${toPdfX(x2).toFixed(2)} ${toPdfY(y2).toFixed(2)} l S\n`;

        // 矢じりベクターの確実な焼き込み
        const mode = d.arrowHead || (d.tool === 'arrow' ? 'end' : 'none');
        if (mode !== 'none') {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.hypot(dx, dy);
          if (len >= 5) {
            const angle = Math.atan2(dy, dx);
            // 美しいシャープなプロ製図開度（片側18度 / 全開36度）
            const arrowAngle = Math.PI / 10;
            const headLen = Math.min(len * 0.35, 12 + lw * 2);

            if (mode === 'end' || mode === 'both') {
              const ax1 = x2 - headLen * Math.cos(angle - arrowAngle);
              const ay1 = y2 - headLen * Math.sin(angle - arrowAngle);
              const ax2 = x2 - headLen * Math.cos(angle + arrowAngle);
              const ay2 = y2 - headLen * Math.sin(angle + arrowAngle);
              stream += `${toPdfX(ax1).toFixed(2)} ${toPdfY(ay1).toFixed(2)} m ${toPdfX(x2).toFixed(2)} ${toPdfY(y2).toFixed(2)} l ${toPdfX(ax2).toFixed(2)} ${toPdfY(ay2).toFixed(2)} l S\n`;
            }

            if (mode === 'start' || mode === 'both') {
              const bx1 = x1 + headLen * Math.cos(angle - arrowAngle);
              const by1 = y1 + headLen * Math.sin(angle - arrowAngle);
              const bx2 = x1 + headLen * Math.cos(angle + arrowAngle);
              const by2 = y1 + headLen * Math.sin(angle + arrowAngle);
              stream += `${toPdfX(bx1).toFixed(2)} ${toPdfY(by1).toFixed(2)} m ${toPdfX(x1).toFixed(2)} ${toPdfY(y1).toFixed(2)} l ${toPdfX(bx2).toFixed(2)} ${toPdfY(by2).toFixed(2)} l S\n`;
            }
          }
        }
        stream += 'Q\n';
      } else if (d.tool === 'check') {
        if (d.x === undefined || d.y === undefined) continue;
        const s = d.fontSize || 14;
        const p1x = d.x + s * 0.15;
        const p1y = d.y + s * 0.55;
        const p2x = d.x + s * 0.42;
        const p2y = d.y + s * 0.85;
        const p3x = d.x + s * 0.9;
        const p3y = d.y + s * 0.18;
        const lw = d.lineWidth || Math.max(2, s * 0.12);

        stream += 'q\n';
        stream += `${rStr} ${gStr} ${bStr} RG 1 J 1 j ${lw} w\n`;
        stream += `${toPdfX(p1x).toFixed(2)} ${toPdfY(p1y).toFixed(2)} m ${toPdfX(p2x).toFixed(2)} ${toPdfY(p2y).toFixed(2)} l ${toPdfX(p3x).toFixed(2)} ${toPdfY(p3y).toFixed(2)} l S\n`;
        stream += 'Q\n';
      } else if (d.tool === 'rect') {
        if (d.x === undefined || d.y === undefined || d.w === undefined || d.h === undefined) continue;
        const rx = toPdfX(d.x).toFixed(2);
        const ry = toPdfY(d.y + d.h).toFixed(2);
        const rw = d.w.toFixed(2);
        const rh = d.h.toFixed(2);
        const lw = (d.lineWidth || 2).toFixed(2);

        stream += 'q\n';
        if (d.fillMode === 'solid') {
          stream += `${rStr} ${gStr} ${bStr} RG ${rStr} ${gStr} ${bStr} rg ${lw} w\n`;
          stream += `${rx} ${ry} ${rw} ${rh} re B\n`;
        } else if (d.fillMode === 'semi') {
          hasSemi = true;
          stream += `/GS_semi gs ${rStr} ${gStr} ${bStr} RG ${rStr} ${gStr} ${bStr} rg ${lw} w\n`;
          stream += `${rx} ${ry} ${rw} ${rh} re B\n`;
        } else {
          stream += `${rStr} ${gStr} ${bStr} RG ${lw} w\n`;
          stream += `${rx} ${ry} ${rw} ${rh} re S\n`;
        }
        stream += 'Q\n';
      } else if (d.tool === 'circle') {
        if (d.x === undefined || d.y === undefined || d.w === undefined || d.h === undefined) continue;
        const cx = toPdfX(d.x + d.w / 2);
        const cy = toPdfY(d.y + d.h / 2);
        const rx = d.w / 2;
        const ry = d.h / 2;
        const kx = rx * 0.55228475;
        const ky = ry * 0.55228475;
        const lw = (d.lineWidth || 2).toFixed(2);

        stream += 'q\n';
        if (d.fillMode === 'solid') {
          stream += `${rStr} ${gStr} ${bStr} RG ${rStr} ${gStr} ${bStr} rg ${lw} w\n`;
        } else if (d.fillMode === 'semi') {
          hasSemi = true;
          stream += `/GS_semi gs ${rStr} ${gStr} ${bStr} RG ${rStr} ${gStr} ${bStr} rg ${lw} w\n`;
        } else {
          stream += `${rStr} ${gStr} ${bStr} RG ${lw} w\n`;
        }
        stream += `${(cx + rx).toFixed(2)} ${cy.toFixed(2)} m\n`;
        stream += `${(cx + rx).toFixed(2)} ${(cy + ky).toFixed(2)} ${(cx + kx).toFixed(2)} ${(cy + ry).toFixed(2)} ${cx.toFixed(2)} ${(cy + ry).toFixed(2)} c\n`;
        stream += `${(cx - kx).toFixed(2)} ${(cy + ry).toFixed(2)} ${(cx - rx).toFixed(2)} ${(cy + ky).toFixed(2)} ${(cx - rx).toFixed(2)} ${cy.toFixed(2)} c\n`;
        stream += `${(cx - rx).toFixed(2)} ${(cy - ky).toFixed(2)} ${(cx - kx).toFixed(2)} ${(cy - ry).toFixed(2)} ${cx.toFixed(2)} ${(cy - ry).toFixed(2)} c\n`;
        stream += `${(cx + kx).toFixed(2)} ${(cy - ry).toFixed(2)} ${(cx + rx).toFixed(2)} ${(cy - ky).toFixed(2)} ${(cx + rx).toFixed(2)} ${cy.toFixed(2)} c\n`;
        stream += d.fillMode === 'solid' || d.fillMode === 'semi' ? 'B\n' : 'S\n';
        stream += 'Q\n';
      } else if (d.tool === 'polygon') {
        if (!d.points || d.points.length < 3) continue;
        const lw = (d.lineWidth || 2).toFixed(2);

        stream += 'q\n';
        if (d.fillMode === 'solid') {
          stream += `${rStr} ${gStr} ${bStr} RG ${rStr} ${gStr} ${bStr} rg ${lw} w\n`;
        } else if (d.fillMode === 'semi') {
          hasSemi = true;
          stream += `/GS_semi gs ${rStr} ${gStr} ${bStr} RG ${rStr} ${gStr} ${bStr} rg ${lw} w\n`;
        } else {
          stream += `${rStr} ${gStr} ${bStr} RG ${lw} w\n`;
        }
        stream += `${toPdfX(d.points[0].x).toFixed(2)} ${toPdfY(d.points[0].y).toFixed(2)} m\n`;
        for (let p = 1; p < d.points.length; p++) {
          stream += `${toPdfX(d.points[p].x).toFixed(2)} ${toPdfY(d.points[p].y).toFixed(2)} l\n`;
        }
        stream += `h ${d.fillMode === 'solid' || d.fillMode === 'semi' ? 'B' : 'S'}\n`;
        stream += 'Q\n';
      } else if (d.tool === 'text') {
        if (d.x === undefined || d.y === undefined || !d.text) continue;
        const fontPx = d.fontSize || 16;
        const estW = d.text.length * fontPx * 1.2 + 20;
        const estH = fontPx + 10;
        const rotDeg = d.rotation || 0;

        // 背景を白で隠す矩形（ベクターで確実に白塗り・回転対応）
        if (d.bgWhite) {
          stream += 'q\n';
          stream += '1 1 1 rg 1 1 1 RG\n';

          if (rotDeg !== 0) {
            const pdfRad = -(rotDeg * Math.PI) / 180;
            const cos = Math.cos(pdfRad).toFixed(6);
            const sin = Math.sin(pdfRad).toFixed(6);
            const negSin = (-Math.sin(pdfRad)).toFixed(6);
            const centerX = d.x - 2 + estW / 2;
            const centerY = d.y - fontPx + 2 + estH / 2;
            const pdfCx = toPdfX(centerX);
            const pdfCy = toPdfY(centerY);

            stream += `${cos} ${sin} ${negSin} ${cos} ${pdfCx.toFixed(2)} ${pdfCy.toFixed(2)} cm\n`;
            stream += `${(-estW / 2).toFixed(2)} ${(-estH / 2).toFixed(2)} ${estW.toFixed(2)} ${estH.toFixed(2)} re f\n`;
          } else {
            stream += `${toPdfX(d.x - 2).toFixed(2)} ${toPdfY(d.y + 4).toFixed(2)} ${estW.toFixed(2)} ${estH.toFixed(2)} re f\n`;
          }

          stream += 'Q\n';
        }

        // テキスト注釈（CJK対応フォント Heiti を指定し日本語でも指定色を100%保持）
        const annot = page.createAnnotation('FreeText');
        annot.setRect([d.x, d.y - fontPx, d.x + estW, d.y + 10]);
        annot.setContents(d.text);
        annot.setColor(rgb);
        annot.setDefaultAppearance('Heiti', fontPx, rgb);
        annot.update();

        // テキスト回転の適用
        if (rotDeg !== 0) {
          const normRot = ((rotDeg % 360) + 360) % 360;
          if (normRot % 90 === 0) {
            annot.getObject().put('Rotate', doc.newInteger(normRot));
          } else {
            try {
              const apN = annot.getObject().resolve().get('AP')?.get('N');
              if (apN && !apN.isNull()) {
                const pdfRad = -(rotDeg * Math.PI) / 180;
                const cos = Math.cos(pdfRad);
                const sin = Math.sin(pdfRad);
                const cx = toPdfX(d.x + estW / 2);
                const cy = toPdfY(d.y - fontPx / 2);
                const e = cx - cx * cos + cy * sin;
                const f = cy - cx * sin - cy * cos;

                const matArr = doc.newArray();
                matArr.push(doc.newReal(cos));
                matArr.push(doc.newReal(sin));
                matArr.push(doc.newReal(-sin));
                matArr.push(doc.newReal(cos));
                matArr.push(doc.newReal(e));
                matArr.push(doc.newReal(f));
                apN.put('Matrix', matArr);
              }
            } catch (err) {
              console.error('Failed to set annotation rotation matrix:', err);
            }
          }
        }
      }

      // 画像アイテムの物理合成（XObject登録 ＆ Contentsストリームへの埋め込み）
      let imgIndex = 0;
      for (const d of drawList) {
        if (
          d.tool === 'image' &&
          (d.imageBytes || d.imageUrl) &&
          d.x !== undefined &&
          d.y !== undefined &&
          d.w !== undefined &&
          d.h !== undefined
        ) {
          try {
            let u8Bytes = d.imageBytes;
            if (!u8Bytes && d.imageUrl && d.imageUrl.startsWith('data:')) {
              const base64Part = d.imageUrl.split(',')[1];
              const bin = atob(base64Part);
              u8Bytes = new Uint8Array(bin.length);
              for (let k = 0; k < bin.length; k++) {
                u8Bytes[k] = bin.charCodeAt(k);
              }
            }

            if (u8Bytes) {
              const img = new m.Image(u8Bytes);
              const imgObj = doc.addImage(img);
              const imgName = `ImG_${i}_${imgIndex++}`;

              let res = pageObj.get('Resources');
              if (!res || res.isNull()) {
                res = doc.newDictionary();
                pageObj.put('Resources', res);
              }
              let xobjs = res.get('XObject');
              if (!xobjs || xobjs.isNull()) {
                xobjs = doc.newDictionary();
                res.put('XObject', xobjs);
              }
              xobjs.put(imgName, imgObj);

              // 座標変換 (PDF座標系: 左下原点)
              const pdfX = toPdfX(d.x);
              const pdfY = toPdfY(d.y + d.h);
              const pdfW = d.w;
              const pdfH = d.h;
              const rot = d.rotation || 0;

              stream += 'q\n';
              if (rot === 0) {
                stream += `${pdfW.toFixed(2)} 0 0 ${pdfH.toFixed(2)} ${pdfX.toFixed(2)} ${pdfY.toFixed(2)} cm\n`;
              } else {
                const rad = (-rot * Math.PI) / 180;
                const cos = Math.cos(rad);
                const sin = Math.sin(rad);
                const cx = pdfX + pdfW / 2;
                const cy = pdfY + pdfH / 2;
                const a = pdfW * cos;
                const b = pdfW * sin;
                const c = -pdfH * sin;
                const dCoeff = pdfH * cos;
                const e = cx - (pdfW * cos - pdfH * sin) / 2;
                const f = cy - (pdfW * sin + pdfH * cos) / 2;
                stream += `${a.toFixed(2)} ${b.toFixed(2)} ${c.toFixed(2)} ${dCoeff.toFixed(2)} ${e.toFixed(2)} ${f.toFixed(2)} cm\n`;
              }
              stream += `/${imgName} Do\n`;
              stream += 'Q\n';
            }
          } catch (imgErr) {
            console.error('画像ベイクエラー:', imgErr);
          }
        }
      }
    }

    // 4. ベクターストリーム（墨消し下地矩形 ＋ 描画図形）をページの Contents に物理合成
    if (stream.trim()) {
      if (hasSemi) {
        let res = pageObj.get('Resources');
        if (!res || res.isNull()) {
          res = doc.newDictionary();
          pageObj.put('Resources', res);
        }
        let extGState = res.get('ExtGState');
        if (!extGState || extGState.isNull()) {
          extGState = doc.newDictionary();
          res.put('ExtGState', extGState);
        }
        const gsSemi = doc.newDictionary();
        gsSemi.put('Type', doc.newName('ExtGState'));
        gsSemi.put('ca', doc.newReal(0.25));
        gsSemi.put('CA', doc.newReal(0.25));
        extGState.put('GS_semi', gsSemi);
      }

      const streamDict = doc.newDictionary();
      const streamObj = doc.addStream(new TextEncoder().encode(stream), streamDict);

      const contents = pageObj.get('Contents');
      if (!contents || contents.isNull()) {
        pageObj.put('Contents', streamObj);
      } else if (contents.isArray()) {
        contents.push(streamObj);
      } else {
        const arr = doc.newArray();
        arr.push(contents);
        arr.push(streamObj);
        pageObj.put('Contents', arr);
      }
    }
  }

  // 5. 編集されたしおりツリーをPDFの /Root/Outlines に反映
  if (bookmarks && bookmarks.length > 0) {
    try {
      const outlinesRef = buildOutlinesDict(doc, bookmarks);
      if (outlinesRef) {
        const trailer = doc.getTrailer();
        const root = trailer.get('Root');
        root.put('Outlines', outlinesRef);
      }
    } catch (err) {
      console.error('Failed to write bookmarks to PDF:', err);
    }
  }

  // 6. ステルス出力記録の刻印（外見・印刷・マウス選択には一切現れない内部辞書署名）
  const opParts: string[] = [];
  if (redactions.length > 0) opParts.push(`墨消し${redactions.length}箇所`);
  if (drawings.length > 0) opParts.push(`校正描画${drawings.length}件`);
  if (Object.values(pageRotations).some((r) => r !== 0)) opParts.push('ページ回転');
  if (bookmarks.length > 0) opParts.push('しおり編集');
  stampHubSignature(doc, opParts.length > 0 ? opParts.join('・') : 'PDF出力');

  // クリーンなPDFとして保存 (不要オブジェクト・切り取られたストリームの完全ガベージコレクション)
  const cleanDocBytes = toSafeUint8Array(doc.saveToBuffer('clean,garbage'));
  doc.destroy();
  return cleanDocBytes;
}
