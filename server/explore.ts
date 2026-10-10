import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import Anthropic from '@anthropic-ai/sdk'

/**
 * Exploration: asks Claude for ideas, brand concepts and logo explorations built
 * from the brand kit. It runs inside the local dev server, so the API key stays in
 * .env.local on your machine and never reaches the browser.
 *
 *   POST /__claude/explore  { mode, count, prompt, brand, seed? }  → NDJSON progress, then the result
 *   GET  /__claude/status                                           → whether a key is set
 *
 * Every skills/<name>/SKILL.md is added to the instructions, so a skill can be
 * swapped or added without touching the code.
 */

export type ExploreMode = 'ideas' | 'concepts' | 'logos'

const MODEL = 'claude-opus-5-5'
const SKILLS_DIR = path.resolve(process.cwd(), 'skills')

const str = { type: 'string' } as const
const strs = { type: 'array', items: str } as const
const list = (item: Record<string, unknown>) => ({
  type: 'object',
  properties: { items: { type: 'array', items: item } },
  required: ['items'],
  additionalProperties: false,
})
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

const SCHEMAS: Record<ExploreMode, Record<string, unknown>> = {
  ideas: list(
    obj({
      title: str,
      summary: str,
      applications: strs,
      why: str,
    }),
  ),
  concepts: list(
    obj({
      name: str,
      idea: str,
      rationale: str,
      tagline: str,
      palette: { type: 'array', items: obj({ name: str, hex: str, role: { type: 'string', enum: ['primary', 'secondary', 'accent', 'neutral'] } }) },
      headingFont: str,
      bodyFont: str,
      voice: strs,
      imagery: str,
    }),
  ),
  logos: list(
    obj({
      name: str,
      concept: str,
      svg: str,
    }),
  ),
}

const TASKS: Record<ExploreMode, string> = {
  ideas:
    'Generate brand application ideas: campaigns, activations, touchpoints, content series and moments where this brand shows up. ' +
    'For each: a short title, a two or three sentence summary, three to five concrete applications (formats or touchpoints), and why it fits the brand in one line.',
  concepts:
    'Generate brand concept directions: distinct strategic and visual routes the brand could take. ' +
    'For each: a name, the idea in one line, a short rationale tied to the kit, a tagline, a palette of four to six colours as #RRGGBB hex with roles ' +
    '(start from the kit colours and say in the rationale what changed), a heading and a body Google Fonts family, three to five voice words, and an imagery direction.',
  logos:
    'Generate logo explorations as standalone SVG. For each: a short name, the concept in one or two sentences, and the complete SVG markup ' +
    '(a single <svg> element with xmlns and viewBox, no width or height, solid fills from the kit colours, no scripts, links, images, filters or gradients).',
}

function skills(): string {
  try {
    return fs
      .readdirSync(SKILLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(SKILLS_DIR, d.name, 'SKILL.md'))
      .filter((f) => fs.existsSync(f))
      .sort()
      .map((f) => fs.readFileSync(f, 'utf8').trim())
      .join('\n\n---\n\n')
  } catch {
    return ''
  }
}

interface Body {
  mode: ExploreMode
  count: number
  prompt: string
  /** The brand kit, written out as text by the app. */
  brand: string
  /** A previous result to build on ("more like this"). */
  seed?: string
}

function readJson(req: IncomingMessage): Promise<Body> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw))
      } catch (e) {
        reject(e)
      }
    })
    req.on('error', reject)
  })
}

function friendly(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Your Anthropic API key was not accepted. Check ANTHROPIC_API_KEY in .env.local, then restart npm run dev.'
  if (e instanceof Anthropic.PermissionDeniedError) return 'This API key does not have access to the model Marque uses.'
  if (e instanceof Anthropic.RateLimitError) return 'Claude is rate limited right now. Try again in a minute.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach Claude. Check your internet connection.'
  if (e instanceof Anthropic.APIError) return `Claude returned an error (${e.status ?? 'unknown'}): ${e.message}`
  const msg = e instanceof Error ? e.message : String(e)
  if (/api.?key|auth.?token|credential/i.test(msg)) return SETUP
  return msg
}

const SETUP = 'Add your Anthropic API key to a file called .env.local in the Marque folder (ANTHROPIC_API_KEY=sk-ant-...), then restart npm run dev.'

async function explore(apiKey: string | undefined, body: Body, send: (line: object) => void, signal: AbortSignal) {
  const mode = body.mode
  if (!SCHEMAS[mode]) throw new Error(`Unknown mode: ${mode}`)
  const count = Math.max(1, Math.min(8, Math.round(body.count) || 3))
  const client = new Anthropic(apiKey ? { apiKey } : {})

  const system =
    `${skills()}\n\n---\n\n` +
    'You work inside Marque, a tool a brand designer uses to build brand guidelines and assets for clients. ' +
    'The designer asks you for explorations; they will choose, refine and present them. Apply the skills above to everything you make. ' +
    'Where a skill describes its own deliverable or output format (a brand board, a written spec), use its method and quality rules but answer in the format the task asks for.'

  const parts = [
    `<brand_kit>\n${body.brand}\n</brand_kit>`,
    body.seed ? `<build_on>\nMake new variations that build on this earlier result:\n${body.seed}\n</build_on>` : '',
    `<task>\n${TASKS[mode]}\nReturn exactly ${count} items.${body.prompt.trim() ? `\nDirection from the designer: ${body.prompt.trim()}` : ''}\n</task>`,
  ]

  const stream = client.beta.messages.stream(
    {
      model: MODEL,
      max_tokens: 64000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: mode === 'logos' ? 'high' : 'medium', format: { type: 'json_schema', schema: SCHEMAS[mode] } },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: parts.filter(Boolean).join('\n\n') }],
    },
    { signal },
  )

  let chars = 0
  let last = 0
  stream.on('text', (t) => {
    chars += t.length
    if (chars - last > 400) {
      last = chars
      send({ type: 'progress', chars })
    }
  })
  const msg = await stream.finalMessage()
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rewording the direction.')
  if (msg.stop_reason === 'max_tokens') throw new Error('The answer was too long and got cut off. Ask for fewer items.')
  const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
  const data = JSON.parse(text) as { items: unknown[] }
  send({ type: 'done', items: data.items, model: msg.model })
}

export function explorePlugin(apiKey: string | undefined): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (req.url === '/__claude/status' && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ready: !!(apiKey || process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN), skills: skills() ? fs.readdirSync(SKILLS_DIR) : [] }))
      return
    }
    if (req.url !== '/__claude/explore' || req.method !== 'POST') return next()
    res.setHeader('Content-Type', 'application/x-ndjson')
    res.setHeader('Cache-Control', 'no-store')
    const send = (line: object) => res.write(JSON.stringify(line) + '\n')
    // Stopping in the app closes the request; stop Claude too, so nothing more is billed.
    const stop = new AbortController()
    res.on('close', () => stop.abort())
    try {
      await explore(apiKey, await readJson(req), send, stop.signal)
    } catch (e) {
      if (!stop.signal.aborted) send({ type: 'error', message: friendly(e) })
    }
    res.end()
  }
  return {
    name: 'marque-explore',
    configureServer(server) {
      server.middlewares.use(handle)
    },
    configurePreviewServer(server) {
      server.middlewares.use(handle)
    },
  }
}
