// Calls the router with the exact request the mod builds, for every case x mode x run.
// usage: TYPESAFE_API_KEY=... npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/collect.mts [runs]
//   ROUTER=jev|laya|kev   which System One router (default jev; laya and kev use their own key variable, optional)
//   ROUTER_URL, ROUTER_MODEL   override the endpoint and model id (any /v1/systemone server, e.g. StartLux)
//   CASES=cases-zh-tw.json     another case file (default cases.json)
//   OUT=results/zh-tw-jev.json where the rows go (default results/raw.json)
//   MODES=balanced             comma-separated routing modes (default all three), for a cheaper run
import { readFileSync, writeFileSync } from 'node:fs'
import { composeState, jevBody, ROUTERS } from '../hooks/register.tsx'
import type { Mode } from '../types'

const MODES = (process.env.MODES?.split(',') ?? ['efficient', 'balanced', 'cheap']) as Mode[]
const POOL = ['haiku', 'sonnet', 'opus', 'fable']
const RUNS = Number(process.argv[2] ?? 2)
const router = ROUTERS[process.env.ROUTER ?? 'jev']
if (!router) throw new Error(`ROUTER must be one of ${Object.keys(ROUTERS).join(', ')}`)
const url = process.env.ROUTER_URL || router.url
const model = process.env.ROUTER_MODEL || router.model
const key = process.env[router.keyEnv]
if (!key && router.keyEnv === 'TYPESAFE_API_KEY') throw new Error('TYPESAFE_API_KEY not set')
const cases = JSON.parse(readFileSync(new URL(process.env.CASES ?? 'cases.json', import.meta.url), 'utf8'))
const out = new URL(process.env.OUT ?? 'results/raw.json', import.meta.url)
const cfg: any = { pool: POOL, minContextTokens: 8000, cacheTtlMs: 300_000, redact: true, sendHistory: true, maxTaskChars: 8000 }

const rows: any[] = []
const jobs = cases.flatMap((c: any) => MODES.flatMap(mode => Array.from({ length: RUNS }, (_, run) => ({ c, mode, run }))))

async function one({ c, mode, run }: any) {
  const state = composeState(c.text, mode, 'claude-sonnet-5-5', '', null, 0, cfg)
  const t0 = performance.now()
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(jevBody(POOL, state, mode, model)),
    })
    const ms = Math.round(performance.now() - t0)
    if (!res.ok) return rows.push({ id: c.id, tier: c.tier, mode, run, ms, error: `HTTP ${res.status}` })
    const a = (await res.json()).answers
    rows.push({ id: c.id, tier: c.tier, mode, run, ms, model: a?.model?.choice, effort: a?.effort?.choice, confidence: a?.model?.confidence ?? 0 })
  } catch (e) {
    rows.push({ id: c.id, tier: c.tier, mode, run, ms: Math.round(performance.now() - t0), error: String(e) })
  }
}

// 4 at a time: polite to the API, and latency stays representative.
const queue = [...jobs]
await Promise.all(Array.from({ length: 4 }, async () => { for (let j; (j = queue.shift()); ) await one(j) }))
writeFileSync(out, JSON.stringify(rows, null, 1))
console.log(`${model} @ ${url}: ${rows.length} calls, ${rows.filter(r => r.error).length} errors → ${out.pathname}`)
