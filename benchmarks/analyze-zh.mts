// Turns results/zh-tw-*.json (one file per router) into results/ZH-TW.md. No network.
// usage: npx tsx --tsconfig benchmarks/tsconfig.json benchmarks/analyze-zh.mts
// results/raw.json (the English cases on Jev) is the baseline for the translated pairs, if present.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { table, pct, mean } from './lib.mts'

const dir = new URL('results/', import.meta.url)
const cases: any[] = JSON.parse(readFileSync(new URL('cases-zh-tw.json', import.meta.url), 'utf8'))
const pairOf = Object.fromEntries(cases.filter(c => c.pair).map(c => [c.id, c.pair]))
const load = (f: string) => JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as any[]
const routers = readdirSync(dir).filter(f => /^zh-tw-.*\.json$/.test(f)).map(f => ({ name: f.slice(6, -5), rows: load(f) }))
if (!routers.length) throw new Error('no results/zh-tw-*.json yet; run collect.mts with CASES=cases-zh-tw.json OUT=results/zh-tw-<router>.json')
const english = existsSync(new URL('raw.json', dir)) ? load('raw.json').filter(r => !r.error) : []

const MODES = ['efficient', 'balanced', 'cheap']
const TIERS = ['trivial', 'standard', 'hard']
const ALIASES = ['haiku', 'sonnet', 'opus', 'fable']
const FIT: Record<string, string[]> = { trivial: ['haiku'], standard: ['sonnet'], hard: ['opus', 'fable'] }
const LEVEL: Record<string, number> = { haiku: 0, sonnet: 1, opus: 2, fable: 3 }
const NEED: Record<string, number> = { trivial: 0, standard: 1, hard: 2 }
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(p * a.length))]!

const out: string[] = ['# zh-TW routing benchmark\n', `${cases.length} Traditional Chinese (Taiwan) coding tasks: ${cases.filter(c => c.pair).length} translated from cases.json (same id) and ${cases.filter(c => !c.pair).length} written for Taiwan (統編, ECPay, 電子發票, LINE, Big5...). Same request the mod sends, three modes, ${routers.map(r => r.name).join(', ')}.\n`]

for (const { name, rows: all } of routers) {
  const errors = all.filter(r => r.error).length
  const rows = all.filter(r => !r.error)
  const by = (mode: string, tier?: string, native?: boolean) => rows.filter(r => r.mode === mode && (!tier || r.tier === tier) && (native === undefined || !pairOf[r.id] === native))
  out.push(`\n## ${name}\n`, `${all.length} calls, ${errors} errors.\n`)

  out.push('### What it picks\n')
  out.push(table(['mode', 'tier', ...ALIASES, 'typical effort', 'mean conf'], MODES.flatMap(m => TIERS.map(t => {
    const rs = by(m, t)
    const eff = [...new Set(rs.map(r => r.effort))].map(e => [e, rs.filter(r => r.effort === e).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0]
    return [m, t, ...ALIASES.map(a => pct(rs.filter(r => r.model === a).length, rs.length)), String(eff), mean(rs.map(r => r.confidence)).toFixed(2)]
  }))))

  out.push('\n### Fit\n', '**Fit**: the tier\'s model (trivial haiku, standard sonnet, hard opus/fable). **Under**: weaker than the tier needs. Split by translated pairs and Taiwan-native tasks, since the natives carry more local vocabulary.\n')
  out.push(table(['mode', 'tasks', 'fit', 'under', 'over'], MODES.flatMap(m => [[m, 'all', undefined], [m, 'translated', false], [m, 'taiwan-native', true]].map(([mode, label, native]) => {
    const rs = by(mode as string, undefined, native as boolean | undefined)
    const fit = rs.filter(r => FIT[r.tier]!.includes(r.model)).length
    const under = rs.filter(r => LEVEL[r.model]! < NEED[r.tier]!).length
    return [mode as string, label as string, pct(fit, rs.length), pct(under, rs.length), pct(rs.length - fit - under, rs.length)]
  }))))

  out.push('\n### Same answer twice\n')
  out.push(table(['mode', 'same model on every run', 'same effort on every run'], MODES.map(m => {
    const g = Object.values(rows.filter(r => r.mode === m).reduce((a: any, r) => ((a[r.id] ??= []).push(r), a), {})) as any[][]
    return [m, pct(g.filter(x => new Set(x.map(r => r.model)).size === 1).length, g.length), pct(g.filter(x => new Set(x.map(r => r.effort)).size === 1).length, g.length)]
  })))

  const ms = rows.map(r => r.ms)
  out.push('', `Latency: p50 **${q(ms, 0.5)} ms**, p95 **${q(ms, 0.95)} ms**, max ${Math.max(...ms)} ms over ${rows.length} calls.`)

  // Language gap: did the translated task get the same model as its English original (raw.json, Jev)?
  if (english.length) {
    const agree = MODES.map(m => {
      const zh = by(m).filter(r => pairOf[r.id])
      const same = zh.filter(r => english.find(e => e.id === pairOf[r.id] && e.mode === m && e.run === r.run)?.model === r.model).length
      return [m, pct(same, zh.length)]
    })
    out.push('\n### Language gap (translated pairs against the English originals on Jev, results/raw.json)\n')
    out.push(table(['mode', 'same model as the English task'], agree))
  }

  out.push('\n### Misses\n', 'Tasks that were under-served or over-served on every run of a mode.\n')
  const misses = MODES.flatMap(m => cases.map(c => {
    const rs = by(m).filter(r => r.id === c.id)
    if (!rs.length || rs.some(r => FIT[c.tier]!.includes(r.model))) return null
    return [m, c.id, c.tier, [...new Set(rs.map(r => r.model))].join('/'), c.text.slice(0, 50)]
  }).filter(Boolean) as string[][])
  out.push(misses.length ? table(['mode', 'id', 'tier', 'picked', 'task'], misses) : 'None.')
}

if (routers.length > 1) {
  out.push('\n## Routers side by side (balanced mode)\n')
  out.push(table(['router', 'fit', 'under', 'over', 'mean conf', 'p50 ms', 'errors'], routers.map(({ name, rows: all }) => {
    const rs = all.filter(r => !r.error && r.mode === 'balanced')
    const fit = rs.filter(r => FIT[r.tier]!.includes(r.model)).length
    const under = rs.filter(r => LEVEL[r.model]! < NEED[r.tier]!).length
    return [name, pct(fit, rs.length), pct(under, rs.length), pct(rs.length - fit - under, rs.length), mean(rs.map(r => r.confidence)).toFixed(2), String(q(rs.map(r => r.ms), 0.5)), String(all.filter(r => r.error).length)]
  })))
}

writeFileSync(new URL('ZH-TW.md', dir), out.join('\n') + '\n')
console.log(out.join('\n'))
