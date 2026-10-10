import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Google Fonts only sends WOFF2 to browsers. Asking through this proxy with a plain
// user agent returns TrueType files, which the vector PDF export embeds.
const proxy = {
  '/__gfonts': {
    target: 'https://fonts.googleapis.com',
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/__gfonts/, ''),
    headers: { 'User-Agent': 'Marque' },
  },
}

export default defineConfig({
  plugins: [react()],
  server: { open: true, proxy },
  preview: { proxy },
})
