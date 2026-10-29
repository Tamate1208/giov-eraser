import fs from 'fs';
import zlib from 'zlib';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const wasmPath = path.resolve(projectRoot, 'node_modules/mupdf/dist/mupdf-wasm.wasm');
const outPath = path.resolve(projectRoot, 'src/utils/wasmBinary.ts');

if (!fs.existsSync(wasmPath)) {
  console.error('mupdf-wasm.wasm not found at', wasmPath);
  process.exit(1);
}

console.log('Reading and compressing mupdf-wasm.wasm...');
const wasmBuffer = fs.readFileSync(wasmPath);
const gzipped = zlib.gzipSync(wasmBuffer, { level: 9 });
const base64Str = gzipped.toString('base64');

console.log(`Original: ${(wasmBuffer.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`Gzipped: ${(gzipped.length / 1024 / 1024).toFixed(2)} MB`);
console.log(`Base64 chars: ${base64Str.length}`);

const code = `// 自動生成された圧縮 Wasm バイナリ (GioV 消しゴム用)
export const GZIPPED_MUPDF_WASM_BASE64 = "${base64Str}";
`;

fs.writeFileSync(outPath, code, 'utf8');
console.log('Saved to', outPath);
