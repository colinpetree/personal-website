import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import zlib from 'node:zlib'
import { compression } from 'vite-plugin-compression2'

export default defineConfig({
  plugins: [
    react(),
    // Precompress build output at build time (runs on the Pi build box, not
    // production) so nginx's gzip_static/brotli_static can serve these
    // siblings with zero runtime CPU cost on the small ARM production box.
    // Originals are always kept (deleteOriginalAssets: false) — nginx falls
    // back to them for clients that don't advertise gzip/br support.
    compression({
      algorithm: 'gzip',
      exclude: [/\.(br)$/, /\.(gz)$/],
      threshold: 1024,
      compressionOptions: { level: 9 },
      deleteOriginalAssets: false,
    }),
    compression({
      algorithm: 'brotliCompress',
      exclude: [/\.(br)$/, /\.(gz)$/],
      threshold: 1024,
      compressionOptions: { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } },
      deleteOriginalAssets: false,
    }),
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:5000'
    }
  }
})
