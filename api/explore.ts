import { exploreHandler } from '../server/explore.js'

// POST /__claude/explore on Vercel (see vercel.json). The key comes from the project's environment variables.
export default exploreHandler(process.env.ANTHROPIC_API_KEY)
