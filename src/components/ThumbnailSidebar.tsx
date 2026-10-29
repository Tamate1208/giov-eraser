import React from 'react'
import { PdfPageInfo, RedactRect } from '../utils/mupdfService'
import { Eraser } from 'lucide-react'

interface ThumbnailSidebarProps {
  pages: PdfPageInfo[];
  currentPage: number;
  redactions: RedactRect[];
  thumbnails: Map<number, string>;
  onSelectPage: (index: number) => void;
}

export const ThumbnailSidebar: React.FC<ThumbnailSidebarProps> = ({
  pages,
  currentPage,
  redactions,
  thumbnails,
  onSelectPage,
}) => {
  // 各ページの墨消し件数を集計
  const countsByPage = new Map<number, number>()
  for (const r of redactions) {
    countsByPage.set(r.pageIndex, (countsByPage.get(r.pageIndex) || 0) + 1)
  }

  return (
    <aside className="w-56 border-r border-slate-800 bg-slate-900/70 backdrop-blur overflow-y-auto p-3 flex flex-col gap-3 select-none">
      <div className="text-[11px] font-semibold text-slate-400 px-1 uppercase tracking-wider flex items-center justify-between">
        <span>ページ一覧 ({pages.length})</span>
      </div>

      <div className="flex flex-col gap-2.5">
        {pages.map((p) => {
          const isSelected = p.index === currentPage
          const count = countsByPage.get(p.index) || 0
          const thumbUrl = thumbnails.get(p.index)

          return (
            <button
              key={p.index}
              onClick={() => onSelectPage(p.index)}
              className={`flex flex-col items-center gap-1.5 p-2 rounded-xl transition text-left group relative border ${
                isSelected
                  ? 'bg-rose-950/40 border-rose-500 shadow-md ring-1 ring-rose-500/50'
                  : 'bg-slate-950/60 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700'
              }`}
            >
              {/* サムネイル画像プレビュー */}
              <div className="w-full aspect-[1/1.4] bg-white rounded flex items-center justify-center overflow-hidden relative shadow-sm">
                {thumbUrl ? (
                  <img
                    src={thumbUrl}
                    alt={`P.${p.index + 1}`}
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="w-full h-full bg-slate-200 animate-pulse flex items-center justify-center text-[10px] text-slate-400">
                    読み込み中...
                  </div>
                )}

                {/* 消しゴム設定バッジ */}
                {count > 0 && (
                  <div className="absolute top-1 right-1 bg-rose-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow flex items-center gap-0.5 ring-1 ring-white/30">
                    <Eraser className="w-2.5 h-2.5" />
                    {count}
                  </div>
                )}
              </div>

              {/* ページ番号 */}
              <span
                className={`text-xs font-semibold ${
                  isSelected ? 'text-rose-400' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              >
                {p.index + 1} ページ
              </span>
            </button>
          )
        })}
      </div>
    </aside>
  )
}
