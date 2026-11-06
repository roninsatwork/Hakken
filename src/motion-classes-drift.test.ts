import { readFileSync } from 'fs'
import path from 'path'
import { describe, expect, test } from 'vitest'
import { repoRoot, walkFiles } from './test/driftUtils'

/**
 * A `transition-*` class has to be able to work (docs/plans/active/movement-classes-note-2026-11-06.md). Tailwind's classes sit in
 * a layer, and CSS outside any layer outranks every layer, however weak its selector. So `* { transition-property: … }` outside a
 * layer, as `globals.css` had from the app's first commit until 2026-11-06, silently stopped every movement class in the app: about
 * 107 places jumped, while tests that read the class names passed. A test can't see movement, so this holds the cause.
 */
function looseMovementRules(css: string): string[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const found: string[] = []
  const open: string[] = []
  let start = 0
  for (let at = 0; at < text.length; at += 1) {
    if (text[at] === '{') {
      open.push(text.slice(start, at).trim())
      start = at + 1
    } else if (text[at] === '}') {
      const body = text.slice(start, at)
      const selector = open.pop() ?? ''
      // Only a rule that reaches everything: a rule for one named class outranks nothing else.
      const reachesAll = selector.split(',').some((one) => one.trim() === '*')
      const layered = open.some((outer) => outer.startsWith('@layer'))
      const lowered = open.some((outer) => outer.startsWith('@media (prefers-reduced-motion'))
      if (reachesAll && !layered && !lowered && /\btransition(-property)?\s*:/.test(body)) found.push(selector)
      start = at + 1
    }
  }
  return found
}

describe('movement classes can work', () => {
  test('no stylesheet sets a transition on everything from outside a layer', () => {
    const sheets = walkFiles(path.join(repoRoot, 'src'), new Set(['.css']))
    expect(sheets.length).toBeGreaterThan(0)
    const loose = sheets.flatMap((file) => looseMovementRules(readFileSync(file, 'utf8')).map((selector) => `${path.relative(repoRoot, file)}: ${selector}`))
    expect(loose).toEqual([])
  })

  test('the guard finds the rule as it used to be, and passes it in its layer', () => {
    const rule = '* { transition-property: color; transition-duration: 300ms; }'
    expect(looseMovementRules(rule)).toEqual(['*'])
    expect(looseMovementRules(`/* a note */ .a { color: red; } ${rule}`)).toEqual(['*'])
    expect(looseMovementRules(`@layer base { ${rule} }`)).toEqual([])
    expect(looseMovementRules('.a { transition: none; }')).toEqual([])
    expect(looseMovementRules('@media (prefers-reduced-motion: reduce) { * { transition-duration: 0s !important; } }')).toEqual([])
  })

  test('a class keeps the speed colours have always eased at, and stops for anyone who asks for less motion', () => {
    const css = readFileSync(path.join(repoRoot, 'src/app/globals.css'), 'utf8')
    expect(css).toContain('--default-transition-duration: 300ms')
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*transition-duration: 0s !important/)
  })
})
