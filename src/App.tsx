import React, { useState, useRef, useEffect } from 'react'
import { Header } from './components/Header'
import { Toolbar } from './components/Toolbar'
import { PdfViewer } from './components/PdfViewer'
import { ThumbnailSidebar } from './components/ThumbnailSidebar'
import {
  getPdfInfo,
  renderPageImage,
  searchPageKeyword,
  applyRedactions,
  RedactRect,
  PdfDocumentInfo,
} from './utils/mupdfService'
import {
  FileUp,
  ShieldCheck,
  FileCheck,
  Zap,
  Sparkles,
  Lock,
  Eraser,
  CheckCircle2,
} from 'lucide-react'

export default function App() {
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [docInfo, setDocInfo] = useState<PdfDocumentInfo | null>(null)
  const [currentPage, setCurrentPage] = useState<number>(0)
  const [zoom, setZoom] = useState<number>(1.0)
  const [colorMode, setColorMode] = useState<'black' | 'white'>('black')
  const [redactions, setRedactions] = useState<RedactRect[]>([])

  // ページごとのレンダリング画像キャッシュ
  const [pageImages, setPageImages] = useState<Map<number, string>>(new Map())
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map())

  // ローディング状態
  const [isLoadingPdf, setIsLoadingPdf] = useState<boolean>(false)
  const [isProcessing, setIsProcessing] = useState<boolean>(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // PDF ファイルのロード処理
  const loadPdf = async (file: File) => {
    try {
      setIsLoadingPdf(true)
      setFileName(file.name)
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      setPdfBytes(bytes)

      // メタ情報取得
      const info = await getPdfInfo(bytes)
      setDocInfo(info)
      setCurrentPage(0)
      setRedactions([])
      setPageImages(new Map())
      setThumbnails(new Map())

      // 最初のページの高画質画像と、サムネイルを非同期読み込み
      const firstPageImg = await renderPageImage(bytes, 0, 1.5)
      setPageImages(new Map([[0, firstPageImg]]))

      // サムネイル生成
      const thumbPromises = info.pages.map(async (p) => {
        const thumb = await renderPageImage(bytes, p.index, 0.3)
        return [p.index, thumb] as [number, string]
      })
      const thumbResults = await Promise.all(thumbPromises)
      setThumbnails(new Map(thumbResults))
    } catch (err) {
      console.error('PDF読み込みエラー:', err)
      alert('PDFファイルの読み込みに失敗しました。正しいPDFファイルかご確認ください。')
    } finally {
      setIsLoadingPdf(false)
    }
  }

  // ページ切り替え時にプレビュー画像をオンデマンド生成
  useEffect(() => {
    if (!pdfBytes || !docInfo) return
    if (!pageImages.has(currentPage)) {
      renderPageImage(pdfBytes, currentPage, 1.5).then((url) => {
        setPageImages((prev) => new Map(prev).set(currentPage, url))
      })
    }
  }, [currentPage, pdfBytes, docInfo])

  // ファイルドラッグ＆ドロップ受付
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0]
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        loadPdf(file)
      } else {
        alert('PDFファイルをドロップしてください。')
      }
    }
  }

  // 消しゴム矩形の追加
  const handleAddRedaction = (rectData: Omit<RedactRect, 'id'>) => {
    const newRect: RedactRect = {
      ...rectData,
      id: `redact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }
    setRedactions((prev) => [...prev, newRect])
  }

  // 消しゴム矩形の削除
  const handleRemoveRedaction = (id: string) => {
    setRedactions((prev) => prev.filter((r) => r.id !== id))
  }

  // 現在ページの消しゴム枠を全クリア
  const handleClearPageRedactions = () => {
    setRedactions((prev) => prev.filter((r) => r.pageIndex !== currentPage))
  }

  // キーワード一括検索消しゴム
  const handleKeywordSearch = async (keyword: string, searchAllPages: boolean) => {
    if (!pdfBytes || !docInfo) return
    setIsProcessing(true)

    try {
      const targetPageIndices = searchAllPages
        ? docInfo.pages.map((p) => p.index)
        : [currentPage]

      let totalFound = 0
      const newRects: RedactRect[] = []

      for (const pIndex of targetPageIndices) {
        const hits = await searchPageKeyword(pdfBytes, pIndex, keyword)
        totalFound += hits.length
        for (const [x0, y0, x1, y1] of hits) {
          newRects.push({
            id: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            x0,
            y0,
            x1,
            y1,
            pageIndex: pIndex,
            color: colorMode,
          })
        }
      }

      if (totalFound > 0) {
        setRedactions((prev) => [...prev, ...newRects])
        const scopeText = searchAllPages ? `全 ${targetPageIndices.length} ページ中、` : '現ページで '
        showToast(`✨ 「${keyword}」に該当する ${scopeText}${totalFound} 箇所を消しゴム指定しました！`)
      } else {
        const scopeText = searchAllPages ? '全ページ' : '現在のページ'
        showToast(`🔍 ${scopeText}で「${keyword}」に一致するテキストは見つかりませんでした。`)
      }
    } catch (err) {
      console.error('キーワード検索エラー:', err)
      alert('キーワード検索中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  // 墨消し実行＆クリーンPDFダウンロード
  const handleSave = async () => {
    if (!pdfBytes) return

    if (redactions.length === 0) {
      showToast('⚠️ 消去したい箇所をドラッグ選択するか、上部の検索窓からキーワードを指定してください。')
      return
    }

    setIsProcessing(true)

    try {
      // 物理墨消しエンジン実行
      const cleanBytes = await applyRedactions(pdfBytes, redactions, colorMode)

      // ダウンロードトリガー (安全にBlob化)
      const blob = new Blob([cleanBytes as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const baseName = fileName ? fileName.replace(/\.pdf$/i, '') : 'document'
      a.download = `${baseName}_墨消し済.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast(`🎉 【${redactions.length}箇所】の完全不可逆墨消しが完了しました！消去箇所以外のテキスト選択・OCR適性は100%保持されています。`)
    } catch (err) {
      console.error('墨消し保存エラー:', err)
      alert('墨消し処理中にエラーが発生しました。')
    } finally {
      setIsProcessing(false)
    }
  }

  const showToast = (msg: string) => {
    setSuccessToast(msg)
    setTimeout(() => {
      setSuccessToast(null)
    }, 4500)
  }

  // リセット
  const handleReset = () => {
    if (window.confirm('現在の設定をリセットして別のPDFを開きますか？')) {
      setPdfBytes(null)
      setFileName(null)
      setDocInfo(null)
      setRedactions([])
      setPageImages(new Map())
      setThumbnails(new Map())
    }
  }

  const currentPageRedactions = redactions.filter((r) => r.pageIndex === currentPage)

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans"
    >
      {/* 非表示のファイル選択入力 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            loadPdf(e.target.files[0])
          }
        }}
      />

      {/* ヘッダー */}
      <Header
        fileName={fileName}
        totalRedactions={redactions.length}
        isProcessing={isProcessing}
        onUploadClick={() => fileInputRef.current?.click()}
        onSaveClick={handleSave}
        onResetClick={handleReset}
      />

      {/* トースト通知 */}
      {successToast && (
        <div className="fixed top-16 right-6 z-50 bg-emerald-950 border border-emerald-500/80 text-emerald-200 px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-fade-in ring-1 ring-emerald-400/50">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="text-xs font-semibold">{successToast}</span>
        </div>
      )}

      {pdfBytes && docInfo ? (
        <>
          {/* ツールバー */}
          <Toolbar
            currentPage={currentPage}
            numPages={docInfo.numPages}
            zoom={zoom}
            colorMode={colorMode}
            pageRedactionCount={currentPageRedactions.length}
            onPageChange={setCurrentPage}
            onZoomChange={setZoom}
            onColorModeChange={setColorMode}
            onClearPageRedactions={handleClearPageRedactions}
            onKeywordSearch={handleKeywordSearch}
          />

          {/* メインワークスペース: サムネイル + メインビューア */}
          <div className="flex-1 flex overflow-hidden">
            {docInfo.numPages > 1 && (
              <ThumbnailSidebar
                pages={docInfo.pages}
                currentPage={currentPage}
                redactions={redactions}
                thumbnails={thumbnails}
                onSelectPage={setCurrentPage}
              />
            )}

            <PdfViewer
              pageImage={pageImages.get(currentPage) || null}
              pageInfo={docInfo.pages[currentPage] || null}
              redactions={currentPageRedactions}
              colorMode={colorMode}
              zoom={zoom}
              onAddRedaction={handleAddRedaction}
              onRemoveRedaction={handleRemoveRedaction}
            />
          </div>
        </>
      ) : (
        /* 初期状態: PDFファイル読み込みエリア */
        <div className="flex-1 flex flex-col items-center justify-center p-8 overflow-y-auto">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="w-full max-w-2xl border-2 border-dashed border-slate-700 hover:border-rose-500/80 rounded-3xl p-12 text-center bg-slate-900/50 hover:bg-slate-900/80 transition duration-200 cursor-pointer group shadow-2xl shadow-black/60 relative overflow-hidden ring-1 ring-white/5"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-pink-500/5 pointer-events-none" />

            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white flex items-center justify-center shadow-xl shadow-rose-500/30 group-hover:scale-105 transition transform">
              <Eraser className="w-10 h-10" />
            </div>

            <h2 className="text-2xl font-bold text-white mb-2">
              PDFファイルをここにドラッグ＆ドロップ
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              または <span className="text-rose-400 font-semibold underline underline-offset-4">ファイルを選択</span> して開く
            </p>

            {/* 特長バッジ */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-left pt-6 border-t border-slate-800">
              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-2 text-rose-400 font-bold text-xs mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  完全不可逆な墨消し
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  指定領域のテキスト・画像をPDF内部から物理削除。コピペや注釈解除による復元は100%不可能です。
                </p>
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-1">
                  <FileCheck className="w-4 h-4" />
                  他テキスト・OCR完全維持
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  消していない箇所のテキストデータは一切劣化させず保持。OCRや別ソフトでの文字選択がそのまま可能です。
                </p>
              </div>

              <div className="bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs mb-1">
                  <Lock className="w-4 h-4" />
                  完全オフライン動作
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  ブラウザ内部（Wasm）で全処理が完結。機密書類が外部サーバーへ送信される心配は一切ありません。
                </p>
              </div>
            </div>
          </div>

          <p className="text-xs text-slate-500 mt-6 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" />
            単一HTMLファイル完結・現場のPCやオフライン環境でもそのままご利用いただけます
          </p>
        </div>
      )}

      {/* 処理中ローディングオーバーレイ */}
      {(isLoadingPdf || isProcessing) && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 text-center ring-1 ring-white/10">
            <div className="w-12 h-12 rounded-full border-4 border-rose-500 border-t-transparent animate-spin" />
            <div>
              <h3 className="font-bold text-white text-sm">
                {isLoadingPdf ? 'PDFを安全に読み込み中...' : '真の不可逆墨消しを実行中...'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {isProcessing
                  ? '内部ストリームからテキストを物理切除し、他テキストのOCR構造を再構築しています'
                  : '端末内部のWebAssemblyエンジンで安全に展開しています'}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
