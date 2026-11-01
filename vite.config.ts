import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * mupdf-wasm.js 内の `new URL("mupdf-wasm.wasm", import.meta.url)` による
 * 未圧縮 Wasm (約14MB Base64) の二重インライン化を防止するプラグイン。
 * 実際の Wasm バイナリは src/utils/wasmBinary.ts (Gzip圧縮済み 約6.3MB) から供給される。
 */
function stripDuplicateMupdfWasm(): Plugin {
  return {
    name: 'strip-duplicate-mupdf-wasm',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('mupdf-wasm.js')) {
        return {
          code: code.replace(
            /new URL\(["']mupdf-wasm\.wasm["'],\s*import\.meta\.url\)\.href/g,
            '""'
          ),
          map: null,
        }
      }
      return null
    },
  }
}

export default defineConfig({
  plugins: [
    stripDuplicateMupdfWasm(),
    react(),
    tailwindcss(),
    viteSingleFile({
      useRecommendedBuildConfig: true,
      removeViteModuleLoader: true
    })
  ],
  build: {
    target: 'esnext',
    assetsInlineLimit: 100000000, // 100MBまでインライン化
    chunkSizeWarningLimit: 50000
  }
})
