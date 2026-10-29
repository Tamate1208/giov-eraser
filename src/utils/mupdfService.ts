import { GZIPPED_MUPDF_WASM_BASE64 } from './wasmBinary';

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
  const rects: Array<[number, number, number, number]> = [];

  for (const hit of hits) {
    for (const q of hit) {
      // Quad [ulx, uly, urx, ury, llx, lly, lrx, lry]
      const x0 = Math.min(q[0], q[4]);
      const y0 = Math.min(q[1], q[3]);
      const x1 = Math.max(q[2], q[6]);
      const y1 = Math.max(q[5], q[7]);
      rects.push([x0 - 2, y0 - 2, x1 + 2, y1 + 2]);
    }
  }

  return rects;
}

/**
 * 完全不可逆墨消し（Redaction）の実行
 * 選択範囲内のテキストストリーム・画像・オブジェクトを物理削除し、
 * 非選択箇所のテキスト選択・OCR適性を100%保持したクリーンPDFを生成する
 */
export async function applyRedactions(
  pdfBytes: Uint8Array,
  redactions: RedactRect[],
  defaultColor: 'black' | 'white' = 'black'
): Promise<Uint8Array> {
  const m = await getMuPdf();
  const doc = m.Document.openDocument(pdfBytes, 'application/pdf');
  const numPages = doc.countPages();

  // ページごとに矩形をグループ化
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
      // [x0, y0, x1, y1]
      annot.setRect([r.x0, r.y0, r.x1, r.y1]);

      // 色設定 (黒または白)
      const color = r.color || defaultColor;
      if (color === 'white') {
        annot.setColor([1, 1, 1]); // 白
      } else {
        annot.setColor([0, 0, 0]); // 黒
      }
    }

    // 物理墨消しをコミット (テキスト・画像ストリーム物理切除)
    // 引数: blackBoxes = true (矩形を描画)
    page.applyRedactions(true);
  }

  // クリーンなPDFとして保存 (不要オブジェクト・切り取られたストリームの完全ガベージコレクション)
  const cleanDocBytes = doc.saveToBuffer('clean,garbage').asUint8Array();
  return cleanDocBytes;
}
