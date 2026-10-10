import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { explorePlugin } from './server/explore'

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

export default defineConfig(({ mode }) => {
  // ANTHROPIC_API_KEY from .env.local (or the shell) powers the Exploration tab.
  const env = loadEnv(mode, process.cwd(), 'ANTHROPIC_')
  return {
    plugins: [react(), explorePlugin(env.ANTHROPIC_API_KEY)],
    server: { open: true, proxy },
    preview: { proxy },
  }
})
