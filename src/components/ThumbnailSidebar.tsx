import React, { useState, useRef, useEffect } from 'react'
import { PdfPageInfo, RedactRect } from '../utils/mupdfService'
import { BookmarkItem } from '../types/drawing'
import {
  Eraser,
  RotateCw,
  Trash2,
  FilePlus,
  Scissors,
  Bookmark,
  BookmarkPlus,
  Edit2,
  Check,
  X,
  FileText,
  ListTree,
  CheckSquare,
  Square,
  Layers,
} from 'lucide-react'

interface ThumbnailSidebarProps {
  width?: number;
  onResizeWidth?: (w: number) => void;
  pages: PdfPageInfo[];
  currentPage: number;
  redactions: RedactRect[];
  thumbnails: Map<number, string>;
  pageRotations: Record<number, number>;
  bookmarks: BookmarkItem[];
  selectedPagesForExtract: Set<number>;
  onSelectPage: (index: number) => void;
  onRotatePage: (pageIndex: number, deltaDeg: number) => void;
  onDeletePage: (pageIndex: number) => void;
  onMergePdfs: (files: FileList) => void;
  onExtractPages: (indices: number[]) => void;
  onTogglePageSelectForExtract: (pageIndex: number) => void;
  onSelectAllPagesForExtract: () => void;
  onClearPageSelectionForExtract: () => void;
  onAddToDesk?: (pageIndex: number) => void;
  onAddSelectedToDesk?: (indices: number[]) => void;
  // しおり操作
  onAddBookmark: (pageIndex: number, title?: string) => void;
  onUpdateBookmark: (id: string, newTitle: string) => void;
  onDeleteBookmark: (id: string) => void;
}

export const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({
  width = 256,
  onResizeWidth,
  pages,
  currentPage,
  redactions,
  thumbnails,
  pageRotations,
  bookmarks,
  selectedPagesForExtract,
  onSelectPage,
  onRotatePage,
  onDeletePage,
  onMergePdfs,
  onExtractPages,
  onTogglePageSelectForExtract,
  onSelectAllPagesForExtract,
  onClearPageSelectionForExtract,
  onAddToDesk,
  onAddSelectedToDesk,
  onAddBookmark,
  onUpdateBookmark,
  onDeleteBookmark,
}) => {
  // タブ切り替え: 'pages' (ページ一覧) | 'bookmarks' (しおり・目次)
  const [activeTab, setActiveTab] = useState<'pages' | 'bookmarks'>('pages')

  // PDF追加結合用の隠しファイルinput
  const mergeFileInputRef = useRef<HTMLInputElement>(null)

  // しおり新規追加の簡易入力ダイアログ用
  const [newBookmarkTitle, setNewBookmarkTitle] = useState('')
  const [isAddingBookmark, setIsAddingBookmark] = useState(false)

  // しおりインライン編集用
  const [editingBookmarkId, setEditingBookmarkId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')

  // 各ページの墨消し件数を集計
  const countsByPage = new Map<number, number>()
  for (const r of redactions) {
    countsByPage.set(r.pageIndex, (countsByPage.get(r.pageIndex) || 0) + 1)
  }

  // しおりの総数を再帰集計
  const countBookmarks = (items: BookmarkItem[]): number => {
    let count = items.length
    for (const it of items) {
      if (it.children) count += countBookmarks(it.children)
    }
    return count
  }
  const totalBookmarkCount = countBookmarks(bookmarks)

  // しおり新規作成ハンドラ
  const handleConfirmAddBookmark = () => {
    const title = newBookmarkTitle.trim() || `${currentPage + 1} ページのしおり`
    onAddBookmark(currentPage, title)
    setNewBookmarkTitle('')
    setIsAddingBookmark(false)
  }

  // 選択ページ抽出ハンドラ
  const handleExtractClick = () => {
    let targetIndices: number[] = []
    if (selectedPagesForExtract.size > 0) {
      targetIndices = Array.from(selectedPagesForExtract).sort((a, b) => a - b)
    } else {
      targetIndices = [currentPage]
    }
    onExtractPages(targetIndices)
  }

  const [isResizing, setIsResizing] = useState(false)
  const resizeStartXRef = useRef<number>(0)
  const resizeStartWidthRef = useRef<number>(width)

  // ドラッグリサイズ処理
  useEffect(() => {
    if (!isResizing || !onResizeWidth) return

    const handlePointerMove = (e: PointerEvent) => {
      // 左サイドバーなので、右に引くと幅が増え、左に引くと幅が減る
      const deltaX = e.clientX - resizeStartXRef.current
      const newWidth = Math.min(500, Math.max(180, resizeStartWidthRef.current + deltaX))
      onResizeWidth(newWidth)
    }

    const handlePointerUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isResizing, onResizeWidth])

  const cols = width < 280 ? 1 : width < 430 ? 2 : 3

  return (
    <aside
      style={{ width: `${width}px` }}
      className="relative shrink-0 border-r border-slate-800 bg-slate-900/80 backdrop-blur-md overflow-hidden flex flex-col select-none shadow-xl z-20 transition-all duration-75"
    >
      {/* リサイザーバー (右端: 当たり判定を14pxへ拡大、64pxハンドル) */}
      {onResizeWidth && (
        <div
          onPointerDown={(e) => {
            e.preventDefault()
            setIsResizing(true)
            resizeStartXRef.current = e.clientX
            resizeStartWidthRef.current = width
          }}
          onDoubleClick={() => onResizeWidth(256)}
          title="ドラッグで幅を調整 / ダブルクリックで標準幅に戻す"
          className={`absolute right-0 top-0 bottom-0 w-3.5 -mr-1.5 cursor-col-resize hover:bg-blue-500/20 transition-colors z-40 group flex items-center justify-center ${
            isResizing ? 'bg-blue-500/30' : 'bg-transparent'
          }`}
        >
          <div className="w-1 h-16 bg-slate-500/60 rounded-full group-hover:bg-blue-400 group-hover:shadow-[0_0_8px_rgba(96,165,250,0.8)] transition-all" />
        </div>
      )}
      {/* 隠しPDFマージ用ファイルinput */}
      <input
        ref={mergeFileInputRef}
        type="file"
        multiple
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onMergePdfs(e.target.files)
            e.target.value = ''
          }
        }}
      />

      {/* 上部タブヘッダー */}
      <div className="flex items-center border-b border-slate-800 bg-slate-950/60 p-1.5 gap-1 shrink-0">
        <button
          onClick={() => setActiveTab('pages')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeTab === 'pages'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>ページ ({pages.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('bookmarks')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-bold transition cursor-pointer ${
            activeTab === 'bookmarks'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>しおり ({totalBookmarkCount})</span>
        </button>
      </div>

      {/* タブコンテンツ */}
      {activeTab === 'pages' ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* ページ管理アクションバー */}
          <div className="p-2 border-b border-slate-800/80 bg-slate-950/30 flex flex-col gap-1.5 shrink-0">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => mergeFileInputRef.current?.click()}
                className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition cursor-pointer active:scale-95"
                title="他のPDFファイルを選択して末尾に結合します"
              >
                <FilePlus className="w-3.5 h-3.5 text-blue-400" />
                <span>PDF追加結合</span>
              </button>
              <button
                onClick={() => onRotatePage(currentPage, 90)}
                className="flex items-center justify-center gap-1 py-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold border border-slate-700 transition cursor-pointer active:scale-95"
                title="表示中のページを右に90度回転します"
              >
                <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                <span>現ページ回転</span>
              </button>
            </div>

            {/* 複数ページ選択時の作業机一括追加バナー */}
            {onAddSelectedToDesk && selectedPagesForExtract.size > 0 && (
              <button
                onClick={() => {
                  const indices = Array.from(selectedPagesForExtract).sort((a, b) => a - b)
                  onAddSelectedToDesk(indices)
                }}
                className="w-full py-1.5 px-2.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-md shadow-blue-600/30 transition active:scale-95 cursor-pointer animate-fade-in"
                title={`選択した${selectedPagesForExtract.size}ページを作業机に一括で送ります`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>選択した {selectedPagesForExtract.size} ページを作業机へ送る</span>
              </button>
            )}

            {/* ページ抽出・選択アクション */}
            <div className="flex items-center justify-between pt-1 border-t border-slate-800/50 text-[10px] text-slate-400">
              <div className="flex items-center gap-1">
                <button
                  onClick={
                    selectedPagesForExtract.size === pages.length
                      ? onClearPageSelectionForExtract
                      : onSelectAllPagesForExtract
                  }
                  className="flex items-center gap-1 hover:text-white transition cursor-pointer"
                  title="ページの選択切り替え"
                >
                  {selectedPagesForExtract.size === pages.length ? (
                    <CheckSquare className="w-3 h-3 text-blue-400" />
                  ) : (
                    <Square className="w-3 h-3 text-slate-500" />
                  )}
                  <span>{selectedPagesForExtract.size > 0 ? `${selectedPagesForExtract.size}頁選択` : '全選択'}</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={handleExtractClick}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 font-bold border border-blue-500/40 transition cursor-pointer active:scale-95"
                  title={
                    selectedPagesForExtract.size > 0
                      ? `選択した${selectedPagesForExtract.size}ページを別PDFとして抽出保存`
                      : '現在のページを別PDFとして抽出保存'
                  }
                >
                  <Scissors className="w-3 h-3 text-blue-400" />
                  <span>抽出保存</span>
                </button>
              </div>
            </div>
          </div>

          {/* ページサムネイル一覧 (1〜3列自動グリッド) */}
          <div className={`flex-1 overflow-y-auto p-3 grid gap-3 content-start ${
            cols === 1 ? 'grid-cols-1' : cols === 2 ? 'grid-cols-2' : 'grid-cols-3'
          }`}>
            {pages.map((p) => {
              const isSelected = p.index === currentPage
              const count = countsByPage.get(p.index) || 0
              const thumbUrl = thumbnails.get(p.index)
              const rot = pageRotations[p.index] || 0
              const isChecked = selectedPagesForExtract.has(p.index)

              return (
                <div
                  key={p.index}
                  className={`flex flex-col gap-1.5 p-2 rounded-xl transition text-left group relative border ${
                    isSelected
                      ? 'bg-blue-950/40 border-blue-500 shadow-lg ring-1 ring-blue-500/50'
                      : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/70 hover:border-slate-700'
                  }`}
                >
                  {/* サムネイル画像プレビュー */}
                  <div
                    onClick={() => onSelectPage(p.index)}
                    className="w-full aspect-[1/1.4] bg-white rounded-lg flex items-center justify-center overflow-hidden relative shadow-sm cursor-pointer"
                  >
                    {thumbUrl ? (
                      <img
                        src={thumbUrl}
                        alt={`P.${p.index + 1}`}
                        className="w-full h-full object-contain transition-transform duration-200"
                        style={{
                          transform: rot ? `rotate(${rot}deg)` : undefined,
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-200 animate-pulse flex items-center justify-center text-[10px] text-slate-400">
                        読込中...
                      </div>
                    )}

                    {/* 複数選択チェックボックス (左上) */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        onTogglePageSelectForExtract(p.index)
                      }}
                      className={`absolute top-1.5 left-1.5 p-1 rounded-md transition cursor-pointer ${
                        isChecked
                          ? 'bg-blue-600 text-white shadow-md ring-2 ring-white/50'
                          : 'bg-black/60 hover:bg-black/90 text-slate-300'
                      }`}
                      title="ページを選択（作業机への一括送信や抽出保存が可能）"
                    >
                      {isChecked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-white" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-300" />
                      )}
                    </div>

                    {/* 回転角度バッジ (右上) */}
                    {rot !== 0 && (
                      <div className="absolute top-1.5 right-1.5 bg-amber-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow flex items-center gap-0.5 ring-1 ring-white/30">
                        <RotateCw className="w-2.5 h-2.5" />
                        {rot}°
                      </div>
                    )}

                    {/* 消しゴム設定バッジ */}
                    {count > 0 && (
                      <div className="absolute bottom-1.5 right-1.5 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow flex items-center gap-0.5 ring-1 ring-white/30">
                        <Eraser className="w-2.5 h-2.5" />
                        {count}
                      </div>
                    )}

                    {/* ホバー時に現れるオーバーレイボタン（回転・削除・作業机へ追加） */}
                    <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-1.5 pointer-events-none">
                      {onAddToDesk && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onAddToDesk(p.index)
                          }}
                          className="p-1.5 rounded-lg bg-blue-600/90 hover:bg-blue-500 text-white shadow-md transition transform hover:scale-110 pointer-events-auto cursor-pointer"
                          title="このページを作業机に置く"
                        >
                          <Layers className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onRotatePage(p.index, 90)
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 shadow-md transition transform hover:scale-110 pointer-events-auto cursor-pointer"
                        title="90度回転"
                      >
                        <RotateCw className="w-4 h-4" />
                      </button>
                      {pages.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            if (window.confirm(`${p.index + 1} ページを削除してもよろしいですか？`)) {
                              onDeletePage(p.index)
                            }
                          }}
                          className="p-1.5 rounded-lg bg-rose-600/90 hover:bg-rose-500 text-white shadow-md transition transform hover:scale-110 pointer-events-auto cursor-pointer"
                          title="このページを削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ページ番号とクイック回転ボタン */}
                  <div className="flex items-center justify-between px-1">
                    <span
                      onClick={() => onSelectPage(p.index)}
                      className={`text-xs font-semibold cursor-pointer ${
                        isSelected ? 'text-blue-400 font-bold' : 'text-slate-400 group-hover:text-slate-200'
                      }`}
                    >
                      {p.index + 1} ページ
                    </span>
                    <button
                      onClick={() => onRotatePage(p.index, 90)}
                      className="p-1 text-slate-500 hover:text-amber-400 transition cursor-pointer"
                      title="90度回転"
                    >
                      <RotateCw className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* しおり（目次 / ブックマーク）タブ */
        <div className="flex-1 flex flex-col min-h-0">
          {/* しおり管理アクションバー */}
          <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/30 flex flex-col gap-2 shrink-0">
            <button
              onClick={() => setIsAddingBookmark(true)}
              className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95"
              title="現在開いているページにしおりを作成します"
            >
              <BookmarkPlus className="w-4 h-4" />
              <span>現頁にしおりを追加 (P.{currentPage + 1})</span>
            </button>

            {/* 新規しおり入力フォーム */}
            {isAddingBookmark && (
              <div className="p-2 rounded-xl bg-slate-800 border border-slate-700 flex flex-col gap-2 animate-fade-in shadow-lg">
                <span className="text-[11px] font-bold text-slate-300">
                  P.{currentPage + 1} のしおり名を入力
                </span>
                <input
                  autoFocus
                  type="text"
                  placeholder="例: 第1章 柱状図概要"
                  value={newBookmarkTitle}
                  onChange={(e) => setNewBookmarkTitle(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleConfirmAddBookmark()
                    if (e.key === 'Escape') setIsAddingBookmark(false)
                  }}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none"
                />
                <div className="flex items-center justify-end gap-1.5 text-xs">
                  <button
                    onClick={() => setIsAddingBookmark(false)}
                    className="px-2 py-0.5 rounded text-slate-400 hover:text-white"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleConfirmAddBookmark}
                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                  >
                    登録
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* しおりツリーリスト */}
          <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-1.5">
            {bookmarks.length > 0 ? (
              <div className="flex flex-col gap-1">
                {bookmarks.map((bm) => (
                  <BookmarkNode
                    key={bm.id}
                    item={bm}
                    currentPage={currentPage}
                    editingId={editingBookmarkId}
                    editingTitle={editingTitle}
                    onSelectPage={onSelectPage}
                    onStartEdit={(item) => {
                      setEditingBookmarkId(item.id)
                      setEditingTitle(item.title)
                    }}
                    onCancelEdit={() => setEditingBookmarkId(null)}
                    onSaveEdit={(id) => {
                      if (editingTitle.trim()) {
                        onUpdateBookmark(id, editingTitle.trim())
                      }
                      setEditingBookmarkId(null)
                    }}
                    onDelete={onDeleteBookmark}
                    onChangeEditingTitle={setEditingTitle}
                  />
                ))}
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-slate-500 gap-2">
                <ListTree className="w-8 h-8 opacity-40 text-emerald-400" />
                <span className="text-xs font-medium text-slate-400">
                  しおり（目次）がありません
                </span>
                <p className="text-[11px] leading-relaxed">
                  上の「現頁にしおりを追加」ボタンから、重要な図面や章にしおりを作成できます。
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  )
}

// しおりツリーノード再帰表示コンポーネント
interface BookmarkNodeProps {
  item: BookmarkItem;
  currentPage: number;
  editingId: string | null;
  editingTitle: string;
  onSelectPage: (page: number) => void;
  onStartEdit: (item: BookmarkItem) => void;
  onCancelEdit: () => void;
  onSaveEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onChangeEditingTitle: (val: string) => void;
  depth?: number;
}

const BookmarkNode: React.FC<BookmarkNodeProps> = ({
  item,
  currentPage,
  editingId,
  editingTitle,
  onSelectPage,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  onChangeEditingTitle,
  depth = 0,
}) => {
  const isSelected = item.page === currentPage
  const isEditing = editingId === item.id

  return (
    <div className="flex flex-col gap-1">
      <div
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        className={`flex items-center justify-between p-1.5 rounded-lg group transition cursor-pointer border ${
          isSelected
            ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-300 font-bold shadow-sm'
            : 'bg-slate-950/40 border-transparent hover:bg-slate-800/60 hover:border-slate-800 text-slate-300'
        }`}
      >
        {isEditing ? (
          <div
            className="flex-1 flex items-center gap-1.5"
            onClick={(e) => e.stopPropagation()}
          >
            <input
              autoFocus
              type="text"
              value={editingTitle}
              onChange={(e) => onChangeEditingTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSaveEdit(item.id)
                if (e.key === 'Escape') onCancelEdit()
              }}
              className="flex-1 bg-slate-900 border border-emerald-500 rounded px-1.5 py-0.5 text-xs text-white focus:outline-none"
            />
            <button
              onClick={() => onSaveEdit(item.id)}
              className="p-1 text-emerald-400 hover:text-emerald-300"
            >
              <Check className="w-3 h-3" />
            </button>
            <button
              onClick={onCancelEdit}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <>
            <div
              onClick={() => onSelectPage(item.page)}
              className="flex-1 flex items-center gap-1.5 truncate mr-1"
              title={`${item.title} (P.${item.page + 1} へジャンプ)`}
            >
              <Bookmark className={`w-3 h-3 shrink-0 ${isSelected ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="text-xs truncate">{item.title}</span>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <span
                onClick={() => onSelectPage(item.page)}
                className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono"
              >
                P.{item.page + 1}
              </span>

              {/* 編集・削除ボタン（ホバー時に表示） */}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onStartEdit(item)
                }}
                className="p-1 text-slate-500 hover:text-slate-200 opacity-0 group-hover:opacity-100 transition"
                title="名前変更"
              >
                <Edit2 className="w-3 h-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onDelete(item.id)
                }}
                className="p-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition"
                title="しおりを削除"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </>
        )}
      </div>

      {/* 子しおり再帰表示 */}
      {item.children && item.children.length > 0 && (
        <div className="flex flex-col gap-1">
          {item.children.map((child) => (
            <BookmarkNode
              key={child.id}
              item={child}
              currentPage={currentPage}
              editingId={editingId}
              editingTitle={editingTitle}
              onSelectPage={onSelectPage}
              onStartEdit={onStartEdit}
              onCancelEdit={onCancelEdit}
              onSaveEdit={onSaveEdit}
              onDelete={onDelete}
              onChangeEditingTitle={onChangeEditingTitle}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}
