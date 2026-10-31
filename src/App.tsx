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
  const [lastAddedRect, setLastAddedRect] = useState<RedactRect | null>(null)

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
      setLastAddedRect(null)
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

  // 消しゴム矩形の追加 (マウス領域ドラッグ時)
  const handleAddRedaction = (rectData: Omit<RedactRect, 'id'>) => {
    const newRect: RedactRect = {
      ...rectData,
      id: `redact_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    }
    setRedactions((prev) => [...prev, newRect])
    setLastAddedRect(newRect)
  }

  // 直前に囲んだ領域を全ページに一括展開
  const handleApplyAreaToAllPages = () => {
    if (!lastAddedRect || !docInfo) return
    if (docInfo.numPages <= 1) {
      showToast('ℹ️ この文書は1ページのみのため、全ページ適用の必要はありません。')
      return
    }

    // 他の全ページに同じ座標で展開
    const otherPages = docInfo.pages.filter((p) => p.index !== lastAddedRect.pageIndex)
    const newRects: RedactRect[] = otherPages.map((p) => ({
      ...lastAddedRect,
      id: `copy_${Date.now()}_p${p.index}_${Math.random().toString(36).substr(2, 7)}`,
      pageIndex: p.index,
    }))

    setRedactions((prev) => [...prev, ...newRects])
    showToast(`✨ 直前に囲んだ領域を、全 ${docInfo.numPages} ページの同じ位置に展開しました！`)
  }

  // 消しゴム矩形の削除
  const handleRemoveRedaction = (id: string) => {
    setRedactions((prev) => prev.filter((r) => r.id !== id))
    if (lastAddedRect && lastAddedRect.id === id) {
      setLastAddedRect(null)
    }
  }

  // 現在ページの消しゴム枠をクリア
  const handleClearPageRedactions = () => {
    setRedactions((prev) => prev.filter((r) => r.pageIndex !== currentPage))
    if (lastAddedRect && lastAddedRect.pageIndex === currentPage) {
      setLastAddedRect(null)
    }
  }

  // 全ページの消しゴム枠を一括クリア
  const handleClearAllRedactions = () => {
    if (redactions.length === 0) return
    if (window.confirm(`全ページの消しゴム枠（合計 ${redactions.length} 箇所）をすべて解除しますか？`)) {
      setRedactions([])
      setLastAddedRect(null)
      showToast('🗑️ 全ページの消しゴム枠をすべて解除しました。')
    }
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
      a.href = url
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
      setLastAddedRect(null)
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
            totalRedactionCount={redactions.length}
            hasLastSelectedArea={lastAddedRect !== null}
            onPageChange={setCurrentPage}
            onZoomChange={setZoom}
            onColorModeChange={setColorMode}
            onClearPageRedactions={handleClearPageRedactions}
            onClearAllRedactions={handleClearAllRedactions}
            onKeywordSearch={handleKeywordSearch}
            onApplyAreaToAllPages={handleApplyAreaToAllPages}
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
        /* 初期状態: Cals-Viewerスタイルの初期画面 */
        <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 bg-slate-950 text-slate-100 overflow-y-auto relative">
          <div className="max-w-2xl w-full flex flex-col items-center">
            {/* タイトルバッジ (Cals-Viewerスタイル) */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs font-semibold mb-4 shadow-sm">
              <ShieldCheck className="w-4 h-4 text-rose-400" />
              <span>GioV PDF Eraser (完全ローカル・スタンドアロン版)</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white text-center mb-2 tracking-tight">
              PDF書類・図面を開いて墨消しを開始
            </h2>
            <p className="text-sm text-slate-400 text-center mb-8 max-w-lg">
              指定箇所のテキストやオブジェクトをPDF内部から物理切除。消去箇所以外のテキスト選択やOCR適性を100%保持した安全な電子ファイルを生成します。
            </p>

            {/* ドロップゾーン */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-8 sm:p-12 border-2 border-dashed rounded-2xl transition flex flex-col items-center justify-center text-center backdrop-blur-sm border-slate-700 bg-slate-900/60 hover:border-rose-500/80 hover:bg-slate-900/80 cursor-pointer group shadow-2xl relative overflow-hidden ring-1 ring-white/5"
            >
              <div className="w-16 h-16 rounded-2xl bg-rose-600/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-5 shadow-inner group-hover:scale-105 transition transform">
                <Eraser className="w-8 h-8 text-rose-400 animate-pulse" />
              </div>

              <h3 className="text-lg font-bold text-slate-100 mb-1">
                PDFファイルをここにドラッグ＆ドロップ
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                土木・建築図面、契約書、報告書、帳票など、あらゆるPDFドキュメントに対応
              </p>

              {/* ボタン */}
              <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-md">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                  className="flex-1 min-w-[200px] flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white text-sm font-semibold shadow-lg shadow-rose-600/25 transition active:scale-95 cursor-pointer ring-1 ring-white/20"
                >
                  <FileUp className="w-4 h-4 text-white" />
                  <span>PDFファイルを選択して開く</span>
                </button>
              </div>
            </div>

            {/* 特徴説明フッター (Cals-Viewerと同一の3カラムカード) */}
            <div className="mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-xs text-slate-400">
              <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200 mb-0.5">完全オフライン＆高セキュリティ</div>
                  <div>データは端末内（ブラウザメモリ）でのみ解析・処理。外部サーバーへの送信は一切行いません。</div>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
                <Eraser className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200 mb-0.5">完全不可逆・真のRedaction</div>
                  <div>指定領域のテキスト・画像を物理削除。DocuWorks等のマスクと異なり、コピペ復元は100%不可能です。</div>
                </div>
              </div>

              <div className="bg-slate-900/40 border border-slate-800 p-3.5 rounded-xl flex items-start gap-2.5">
                <FileCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-slate-200 mb-0.5">OCR適性・他テキスト完全維持</div>
                  <div>消去箇所以外の文字構造やフォント情報はそのまま維持。他システムでのOCRやテキスト選択に支障ありません。</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 処理中ローディングオーバーレイ (Cals-Viewerスタイル) */}
      {(isLoadingPdf || isProcessing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl p-8 max-w-md w-full shadow-2xl flex flex-col items-center text-center">
            {/* 大きなスピナー */}
            <div className="relative mb-5">
              <div className="w-16 h-16 rounded-full border-4 border-rose-500/20 border-t-rose-500 animate-spin" />
              <Eraser className="w-8 h-8 text-rose-400 absolute inset-0 m-auto animate-pulse" />
            </div>

            <h3 className="text-lg font-bold text-white mb-2">
              {isLoadingPdf ? 'PDFドキュメントを読み込み中' : '不可逆墨消しを実行中'}
            </h3>
            
            {/* リアルタイム進捗メッセージ */}
            <p className="text-sm font-medium text-rose-400 mb-4 min-h-[1.5rem]">
              {isLoadingPdf
                ? '端末内部のWebAssemblyエンジンで安全に展開中...'
                : '指定箇所のテキストを物理切除し、他テキストのOCR構造を保持中...'}
            </p>

            {/* パルスプログレスバー */}
            <div className="w-full bg-slate-800 rounded-full h-2 mb-4 overflow-hidden relative">
              <div className="bg-gradient-to-r from-rose-600 via-pink-500 to-emerald-400 h-full w-full animate-pulse" />
            </div>

            <div className="text-[11px] text-slate-400 space-y-1">
              <div>・外部へのデータ送信は一切行いません（完全ローカル完結・オフライン処理）</div>
              <div>・消去箇所以外のテキスト選択・OCR適性を100%保持します</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
