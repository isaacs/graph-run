import { setTimeout } from 'node:timers/promises'
import t from 'tap'
import {
  RunnerOptions,
  RunnerOptionsSync,
} from '../dist/commonjs/index.js'
import {
  allSettled,
  allSettledSync,
  any,
  anySync,
  graphRun,
  graphRunSync,
  race,
  raceSync,
  Runner,
  RunnerSync,
} from '../src/index.js'

const g = {
  any,
  anySync,
  graphRun,
  graphRunSync,
  race,
  raceSync,
  Runner,
  RunnerSync,
}
g

// WARNING: this is the most dangerous problem in mathematics!
// Note that it defines an infinitely large graph, as it contains all
// integers. Thankfully, we'll only traverse a small part of it, because as
// far as anyone has seen, it always results in a loop at some point, though
// as of 2024 this has never been proven rigorously. It is said that trying
// to solve this problem will result in one's entire life being consumed.
const danger = (x: number) => (x % 2 === 0 ? x / 2 : 3 * x + 1)

t.test('async graph traversal', async t => {
  const visited: number[] = []
  const paths: Map<number, number[]> = new Map()
  const cycles: [number, number[], number[]][] = []
  const results = await graphRun({
    graph: [7, 23, 22, 64],
    getDeps: async n => [danger(n)],
    visit: async (n, signal, path) => {
      visited.push(n)
      t.type(signal, AbortSignal)
      paths.set(n, path)
      // stress it by making it actually async
      await setTimeout(Math.floor(Math.random() * 10))
      return path
    },
    onCycle: async (n, cycle, path) => {
      cycles.push([n, cycle, path])
    },
  })
  const uniqueVisits = new Set(visited)
  t.equal(
    visited.length,
    uniqueVisits.size,
    'visited each node 1 time',
  )
  t.matchSnapshot(
    visited.sort((a, b) => a - b),
    'visited',
  )
  t.matchSnapshot(Object.fromEntries([...results]), 'results')
  t.matchSnapshot(Object.fromEntries([...paths]), 'paths')
  t.matchSnapshot(cycles, 'cycles')
})

t.test('sync graph traversal', t => {
  // note that the paths will be fewer and longer in this case,
  // because there is no parallel preemption of repeated nodes
  const visited: number[] = []
  const paths: Map<number, number[]> = new Map()
  const cycles: [number, number[], number[]][] = []
  const results = graphRunSync({
    graph: [7, 23, 22, 64],
    getDeps: n => [danger(n)],
    visit: (n, signal, path) => {
      visited.push(n)
      t.type(signal, AbortSignal)
      paths.set(n, path)
      return path
    },
    onCycle: (n, cycle, path) => {
      cycles.push([n, cycle, path])
    },
  })
  const uniqueVisits = new Set(visited)
  t.equal(
    visited.length,
    uniqueVisits.size,
    'visited each node 1 time',
  )
  t.matchSnapshot(
    visited.sort((a, b) => a - b),
    'visited',
  )
  t.matchSnapshot(Object.fromEntries([...results]), 'results')
  t.matchSnapshot(Object.fromEntries([...paths]), 'paths')
  t.matchSnapshot(cycles, 'cycles')
  t.end()
})

// return all the factors of a number >= its square root
// eg 12 -> [4, 6]
// for primes (or non-integers), returns []
const bigFactors = (n: number): number[] => {
  const s = Math.sqrt(n)
  const f: number[] = []
  for (let i = 2; i <= s; i++) {
    const d = n / i
    if (d === Math.floor(d)) f.unshift(d)
  }
  return f
}

t.test('any', async t => {
  const largestPrimeFactor = async (num: number): Promise<number> => {
    const opts: RunnerOptions<number, number> = {
      graph: [num],
      getDeps: bigFactors,
      visit: (n, _, path, dependencyResults) => {
        for (const p of path) {
          const d = num / p
          t.equal(
            d,
            Math.floor(d),
            'should only find integer factors',
          )
        }
        t.equal(dependencyResults.size, 0, 'stops at leaf node')
        return n
      },
    }
    return await any(opts)
  }
  const three = await largestPrimeFactor(24)
  t.equal(three, 3)

  const big = await largestPrimeFactor(12345678)
  t.equal(big, 14593)
})

t.test('anySync', t => {
  const largestPrimeFactor = (num: number): number => {
    const opts: RunnerOptionsSync<number, number> = {
      graph: [num],
      getDeps: bigFactors,
      visit: (n, _, path, dependencyResults) => {
        for (const p of path) {
          const d = num / p
          t.equal(
            d,
            Math.floor(d),
            'should only find integer factors',
          )
        }
        t.equal(dependencyResults.size, 0, 'stops at leaf node')
        return n
      },
    }
    return anySync(opts)
  }
  const three = largestPrimeFactor(24)
  t.equal(three, 3)

  const big = largestPrimeFactor(12345678)
  t.equal(big, 14593)

  t.end()
})

t.test('exploring various shapes', async t => {
  const getDeps = (n: any): any[] => {
    const { name, ...props } = n
    return Object.values(props)
  }

  // base/links
  type O = { name: string } & {
    [k in 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h']?: O
  }
  const shapes: [O, (o: O) => void][] = [
    [{ name: 'selfLink' }, o => Object.assign(o, { selfLink: o })],
    [
      {
        name: 'couple',
        a: { name: 'a' },
        b: { name: 'b' },
      },
      o => {
        Object.assign(o.a as O, { b: o.b })
        Object.assign(o.b as O, { a: o.a })
      },
    ],
    [
      {
        name: 'triangle',
        a: { name: 'a', b: { name: 'b', c: { name: 'c' } } },
      },
      o => Object.assign(o.a?.b?.c as O, { a: o.a }),
    ],
    [
      {
        name: 'tripod',
        a: { name: 'a' },
        b: { name: 'b' },
        c: { name: 'c' },
      },
      o => {
        Object.assign(o.a as O, { b: o.b })
        Object.assign(o.b as O, { c: o.c })
        Object.assign(o.c as O, { a: o.a })
      },
    ],
    [
      {
        name: 'pyramid',
        a: { name: 'a' },
        b: { name: 'b' },
        c: { name: 'c' },
      },
      o => {
        Object.assign(o.a as O, { b: o.b })
        Object.assign(o.b as O, { c: o.c })
        Object.assign(o.c as O, { a: o.a })
        Object.assign(o.a as O, { c: o.c })
        Object.assign(o.b as O, { a: o.a })
        Object.assign(o.c as O, { b: o.b })
      },
    ],
    [
      // o->a<->b<->c
      //    ^-------^
      {
        name: 'throuple',
        a: { name: 'a', b: { name: 'b', c: { name: 'c' } } },
      },
      o => {
        Object.assign(o.a as O, { c: o.a?.b?.c })
        Object.assign(o.a?.b as O, { a: o.a })
        Object.assign(o.a?.b?.c as O, {
          a: o.a,
          b: o.a?.b,
        })
      },
    ],
    [
      {
        name: 'diamond',
        a: { name: 'a', c: { name: 'c' } },
        b: { name: 'b' },
      },
      o => Object.assign(o.b as O, { c: o.a?.c }),
    ],
    [
      {
        name: 'square',
        a: { name: 'a', c: { name: 'c' }, d: { name: 'd' } },
        b: { name: 'b' },
      },
      o => {
        Object.assign(o.b as O, { c: o.a?.c, d: o.a?.d })
      },
    ],
    [
      {
        name: 'bush',
        a: {
          name: 'a',
          b: { name: 'b', g: { name: 'g' } },
          c: { name: 'c' },
          d: { name: 'd' },
          e: { name: 'e' },
          f: { name: 'f' },
        },
      },
      o => {
        Object.assign(o.a?.b as O, { ...o.a, name: 'b' })
        Object.assign(o.a?.c as O, {
          ...o.a,
          g: o.a?.b?.g as O,
          name: 'c',
        })
        Object.assign(o.a?.d as O, {
          ...o.a,
          g: o.a?.b?.g as O,
          name: 'd',
        })
        Object.assign(o.a?.e as O, {
          ...o.a,
          g: o.a?.b?.g as O,
          name: 'e',
        })
        Object.assign(o.a?.f as O, {
          ...o.a,
          g: o.a?.b?.g as O,
          name: 'f',
        })
      },
    ],
    [
      {
        name: 'ring',
        a: {
          name: 'a',
          b: {
            name: 'b',
            c: {
              name: 'c',
              d: {
                name: 'd',
                e: {
                  name: 'e',
                  f: {
                    name: 'f',
                    g: { name: 'g', h: { name: 'h' } },
                  },
                },
              },
            },
          },
        },
      },
      o => Object.assign(o?.a?.b?.c?.d?.e?.f?.g?.h as O, { a: o.a }),
    ],
  ]

  for (const [o, link] of shapes) {
    link(o)
    type V = [string, string[], { [k: string]: string | undefined }]
    const visits: V[] = []
    type C = [string, string, string]
    const cycles: C[] = []
    t.test(o.name, async t => {
      const r = new Runner<O, string>({
        graph: [o],
        visit: (node, _, path, depResults) => {
          const v: V = [
            node.name,
            path.map(({ name }) => name),
            Object.fromEntries(
              [...depResults].map(([d, r]) => [d.name, r]),
            ),
          ]
          visits.push(v)
          return node.name
        },
        getDeps,
        onCycle: (node, cycle, path) => {
          cycles.push([
            node.name,
            path.map(c => c.name).join('->'),
            cycle.map(c => c.name).join('->'),
          ])
        },
      })
      await r.run()
      t.matchSnapshot(visits, 'visits')
      t.matchSnapshot(cycles, 'cycles')
    })
  }
})

t.test('race, any, allSettled', async t => {
  const options: RunnerOptionsSync<string, string> = {
    graph: ['a', 'd'],
    getDeps(s) {
      if (s === 'z') return ['a']
      if (s === 'y') return ['z', 'a']
      const cc = s.charCodeAt(0)
      return [
        String.fromCharCode(cc + 1),
        String.fromCharCode(cc + 2),
      ]
    },
    visit(node) {
      return node.toUpperCase()
    },
  }
  t.equal(await race<string, string>(options), 'Z')
  t.equal(raceSync(options), 'Z')
  t.equal(await any(options), 'Z')
  t.equal(anySync(options), 'Z')

  const throwOptions: typeof options = {
    ...options,
    visit: s => {
      if (s === 'w') return s.toUpperCase()
      throw new Error('glorp')
    },
  }
  t.equal(await any(throwOptions), 'W')
  t.equal(anySync(throwOptions), 'W')
  const allThrow: typeof options = {
    ...options,
    visit: () => {
      throw new Error('glorp')
    },
  }
  t.rejects(any(allThrow), AggregateError)
  t.throws(() => anySync(allThrow), AggregateError)
  const settled = await allSettled(throwOptions)
  const settledSync = allSettledSync(throwOptions)
  t.strictSame(settled, settledSync)
  for (let i = 'a'.charCodeAt(0); i <= 'z'.charCodeAt(0); i++) {
    const c = String.fromCharCode(i)
    const res = settled.get(c)
    if (c === 'w')
      t.strictSame(res, { status: 'fulfilled', value: 'W' })
    else
      t.matchOnly(res, {
        status: 'rejected',
        reason: new Error('glorp'),
      })
  }

  t.rejects(graphRun(throwOptions), {
    cause: { cause: new Error('glorp') },
  })
  t.throws(() => graphRunSync(throwOptions), {
    cause: { cause: new Error('glorp') },
  })

  const noFF = { ...throwOptions, failFast: false }
  t.rejects(graphRun(noFF), AggregateError)
  t.throws(() => graphRunSync(noFF), AggregateError)
})

t.test('Runner.route()', async t => {
  const options: RunnerOptionsSync<string, string> = {
    graph: ['a', 'n', '?'],
    getDeps(s) {
      if (s === 'z' || s === 'm') return []
      if (s === 'l') return ['m']
      if (s === 'y') return ['z']
      if (s === '?') return ['?']
      const cc = s.charCodeAt(0)
      return [
        String.fromCharCode(cc + 1),
        String.fromCharCode(cc + 2),
      ]
    },
    visit(node) {
      return node.toUpperCase()
    },
  }
  const r = new Runner(options)
  await r.run()
  t.strictSame(r.route('n', 'w'), ['n', 'o', 'q', 's', 'u', 'w'])
  t.equal(r.route('x', '.'), undefined)
  t.equal(r.route('.', 'x'), undefined)
  t.equal(r.route('x', 'w'), undefined)
  t.equal(r.route('a', 'z'), undefined)
  t.equal(r.route('b', 'a'), undefined)
  t.equal(r.route('?', '?'), undefined)
})

t.test('entry points required', t => {
  const options: RunnerOptionsSync<string, string> = {
    //@ts-ignore
    graph: [],
    getDeps(s) {
      if (s === 'z') return []
      if (s === 'y') return ['z']
      const cc = s.charCodeAt(0)
      return [
        String.fromCharCode(cc + 1),
        String.fromCharCode(cc + 2),
      ]
    },
    visit(node) {
      return node.toUpperCase()
    },
  }

  t.throws(() => new Runner(options), {
    message: 'no nodes provided to graph traversal',
  })
  t.end()
})
