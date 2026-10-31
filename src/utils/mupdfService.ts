import { GZIPPED_MUPDF_WASM_BASE64 } from './wasmBinary';
import { DrawingItem } from '../types/drawing';

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

export interface PdfDocumentInfo {
  numPages: number;
  pages: PdfPageInfo[];
}

/**
 * PDFのメタ情報取得
 */
export async function getPdfInfo(pdfBytes: Uint8Array): Promise<PdfDocumentInfo> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const numPages = doc.countPages();
  const pages: PdfPageInfo[] = [];

  for (let i = 0; i < numPages; i++) {
    const page = doc.loadPage(i);
    const bounds = page.getBounds(); // [x0, y0, x1, y1]
    const w = Math.abs(bounds[2] - bounds[0]);
    const h = Math.abs(bounds[3] - bounds[1]);
    pages.push({
      index: i,
      width: w,
      height: h,
      rotation: 0,
    });
  }

  return { numPages, pages };
}

/**
 * ページのプレビュー画像を生成 (PNG Data URL)
 */
export async function renderPageImage(
  pdfBytes: Uint8Array,
  pageIndex: number,
  scale: number = 1.5
): Promise<string> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const page = doc.loadPage(pageIndex);

  const matrix = m.Matrix.scale(scale, scale);
  const pixmap = page.toPixmap(matrix, m.ColorSpace.DeviceRGB, false);
  const pngBytes = pixmap.asPNG();

  // Blob URL 生成
  const blob = new Blob([pngBytes.buffer as ArrayBuffer], { type: 'image/png' });
  return URL.createObjectURL(blob);
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
 * 完全不可逆墨消し（Redaction）および描画・校正オブジェクトの合成実行
 * 選択範囲内のテキストストリーム・画像・オブジェクトを物理削除し、
 * その上に赤書・文字・囲み等のベクター注釈を高精度に合成したクリーンPDFを生成する
 */
export async function applyRedactions(
  pdfBytes: Uint8Array,
  redactions: RedactRect[],
  defaultColor: 'black' | 'white' = 'black',
  drawings: DrawingItem[] = []
): Promise<Uint8Array> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const numPages = doc.countPages();

  // 1. 墨消し物理切除の実行
  if (redactions.length > 0) {
    const pageMap = new Map<number, RedactRect[]>();
    for (const r of redactions) {
      const list = pageMap.get(r.pageIndex) || [];
      list.push(r);
      pageMap.set(r.pageIndex, list);
    }

    for (let i = 0; i < numPages; i++) {
      const rectList = pageMap.get(i);
      if (!rectList || rectList.length === 0) continue;

      const page = doc.loadPage(i);

      for (const r of rectList) {
        const annot = page.createAnnotation('Redact');
        annot.setRect([r.x0, r.y0, r.x1, r.y1]);

        const color = r.color || defaultColor;
        if (color === 'white') {
          annot.setColor([1, 1, 1]); // 白
        } else {
          annot.setColor([0, 0, 0]); // 黒
        }
      }

      // 物理墨消しをコミット (テキスト・画像ストリーム物理切除)
      page.applyRedactions(true);
    }
  }

  // 2. 描画・校正アイテムの合成適用
  if (drawings && drawings.length > 0) {
    const drawPageMap = new Map<number, DrawingItem[]>();
    for (const d of drawings) {
      const list = drawPageMap.get(d.pageIndex) || [];
      list.push(d);
      drawPageMap.set(d.pageIndex, list);
    }

    for (let i = 0; i < numPages; i++) {
      const drawList = drawPageMap.get(i);
      if (!drawList || drawList.length === 0) continue;

      const page = doc.loadPage(i);

      for (const d of drawList) {
        const rgb = hexToRgb(d.color);

        if (d.tool === 'arrow' || d.tool === 'line') {
          if (!d.points || d.points.length < 2) continue;
          const x1 = d.points[0].x;
          const y1 = d.points[0].y;
          const x2 = d.points[1].x;
          const y2 = d.points[1].y;

          // 線本体
          const annot = page.createAnnotation('Line');
          annot.setLine([x1, y1], [x2, y2]);
          annot.setColor(rgb);
          annot.setBorderWidth(d.lineWidth || 2);
          annot.update();

          // 矢じり（あらゆるPDFビューアで100%確実に表示されるよう物理線として描画）
          const mode = d.arrowHead || (d.tool === 'arrow' ? 'end' : 'none');
          if (mode !== 'none') {
            const dx = x2 - x1;
            const dy = y2 - y1;
            const len = Math.hypot(dx, dy);
            if (len >= 5) {
              const angle = Math.atan2(dy, dx);
              // 美しいシャープなプロ製図開度（片側18度 / 全開36度）
              const arrowAngle = Math.PI / 10;
              const headLen = Math.min(len * 0.35, 12 + (d.lineWidth || 2) * 2);

              if (mode === 'end' || mode === 'both') {
                const ax1 = x2 - headLen * Math.cos(angle - arrowAngle);
                const ay1 = y2 - headLen * Math.sin(angle - arrowAngle);
                const ax2 = x2 - headLen * Math.cos(angle + arrowAngle);
                const ay2 = y2 - headLen * Math.sin(angle + arrowAngle);

                const h1 = page.createAnnotation('Line');
                h1.setLine([ax1, ay1], [x2, y2]);
                h1.setColor(rgb);
                h1.setBorderWidth(d.lineWidth || 2);
                h1.update();

                const h2 = page.createAnnotation('Line');
                h2.setLine([ax2, ay2], [x2, y2]);
                h2.setColor(rgb);
                h2.setBorderWidth(d.lineWidth || 2);
                h2.update();
              }

              if (mode === 'start' || mode === 'both') {
                const bx1 = x1 + headLen * Math.cos(angle - arrowAngle);
                const by1 = y1 + headLen * Math.sin(angle - arrowAngle);
                const bx2 = x1 + headLen * Math.cos(angle + arrowAngle);
                const by2 = y1 + headLen * Math.sin(angle + arrowAngle);

                const h1 = page.createAnnotation('Line');
                h1.setLine([bx1, by1], [x1, y1]);
                h1.setColor(rgb);
                h1.setBorderWidth(d.lineWidth || 2);
                h1.update();

                const h2 = page.createAnnotation('Line');
                h2.setLine([bx2, by2], [x1, y1]);
                h2.setColor(rgb);
                h2.setBorderWidth(d.lineWidth || 2);
                h2.update();
              }
            }
          }
        } else if (d.tool === 'rect') {
          if (d.x === undefined || d.y === undefined || d.w === undefined || d.h === undefined) continue;
          const annot = page.createAnnotation('Square');
          annot.setRect([d.x, d.y, d.x + d.w, d.y + d.h]);
          annot.setColor(rgb);
          annot.setBorderWidth(d.lineWidth || 2);
          if (d.fillMode === 'solid') {
            annot.setInteriorColor(rgb);
          } else if (d.fillMode === 'semi') {
            annot.setInteriorColor(rgb);
            annot.setOpacity(0.25);
          }
          annot.update();
        } else if (d.tool === 'circle') {
          if (d.x === undefined || d.y === undefined || d.w === undefined || d.h === undefined) continue;
          const annot = page.createAnnotation('Circle');
          annot.setRect([d.x, d.y, d.x + d.w, d.y + d.h]);
          annot.setColor(rgb);
          annot.setBorderWidth(d.lineWidth || 2);
          if (d.fillMode === 'solid') {
            annot.setInteriorColor(rgb);
          } else if (d.fillMode === 'semi') {
            annot.setInteriorColor(rgb);
            annot.setOpacity(0.25);
          }
          annot.update();
        } else if (d.tool === 'polygon') {
          if (!d.points || d.points.length < 3) continue;
          const annot = page.createAnnotation('Polygon');
          for (const pt of d.points) {
            annot.addVertex([pt.x, pt.y]);
          }
          annot.setColor(rgb);
          annot.setBorderWidth(d.lineWidth || 2);
          if (d.fillMode === 'solid') {
            annot.setInteriorColor(rgb);
          } else if (d.fillMode === 'semi') {
            annot.setInteriorColor(rgb);
            annot.setOpacity(0.25);
          }
          annot.update();
        } else if (d.tool === 'text') {
          if (d.x === undefined || d.y === undefined || !d.text) continue;
          const fontPx = d.fontSize || 16;
          const estW = d.text.length * fontPx * 1.2 + 20;
          const estH = fontPx + 10;

          if (d.bgWhite) {
            const bgAnnot = page.createAnnotation('Square');
            bgAnnot.setRect([d.x - 2, d.y - fontPx + 2, d.x + estW, d.y + 4]);
            bgAnnot.setColor([1, 1, 1]);
            bgAnnot.setInteriorColor([1, 1, 1]);
            bgAnnot.setBorderWidth(0);
            bgAnnot.update();
          }

          const annot = page.createAnnotation('FreeText');
          annot.setRect([d.x, d.y - fontPx, d.x + estW, d.y + 10]);
          annot.setContents(d.text);
          annot.setColor(rgb);
          annot.setDefaultAppearance('Helvetica', fontPx, rgb);
          annot.update();
        } else if (d.tool === 'check') {
          if (d.x === undefined || d.y === undefined) continue;
          const ox = d.x;
          const oy = d.y;
          const s = d.fontSize || 14;
          const p1x = ox + s * 0.15;
          const p1y = oy + s * 0.55;
          const p2x = ox + s * 0.42;
          const p2y = oy + s * 0.85;
          const p3x = ox + s * 0.9;
          const p3y = oy + s * 0.18;

          const line1 = page.createAnnotation('Line');
          line1.setLine([p1x, p1y], [p2x, p2y]);
          line1.setColor(rgb);
          line1.setBorderWidth(d.lineWidth || Math.max(2, s * 0.12));
          line1.update();

          const line2 = page.createAnnotation('Line');
          line2.setLine([p2x, p2y], [p3x, p3y]);
          line2.setColor(rgb);
          line2.setBorderWidth(d.lineWidth || Math.max(2, s * 0.12));
          line2.update();
        }
      }
    }
  }

  // クリーンなPDFとして保存 (不要オブジェクト・切り取られたストリームの完全ガベージコレクション)
  const cleanDocBytes = doc.saveToBuffer('clean,garbage').asUint8Array();
  return cleanDocBytes;
}
