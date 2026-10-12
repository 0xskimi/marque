import { statusHandler } from '../server/explore.js'

// GET /__claude/status on Vercel (see vercel.json).
export default statusHandler(process.env.ANTHROPIC_API_KEY)
