import { describe, expect, it } from 'vitest'

// UX-3: la interfaz es para Ecuador, en tuteo. Este test lee el texto de las pantallas y falla si aparece voseo
// («entrá», «tenés», «acá»). Si falla, cámbialo a tuteo («entra», «tienes», «aquí»). Si una palabra legítima
// coincide por error, quítala de la lista de abajo y explica por qué en el PR.

const VOSEO = [
  // pronombre y verbos conjugados
  'vos', 'sos', 'tenés', 'podés', 'querés', 'sabés', 'entrás', 'cerrás', 'hacés', 'ponés', 'venís', 'decís',
  // imperativos
  'abrí', 'accedé', 'agregá', 'andá', 'buscá', 'cargá', 'cerrá', 'completá', 'confirmá', 'dejá', 'describí',
  'descargá', 'elegí', 'enviá', 'entrá', 'escribí', 'esperá', 'filtrá', 'generá', 'guardá', 'hacé', 'indicá',
  'ingresá', 'iniciá', 'mirá', 'ordená', 'ponete', 'postulá', 'probá', 'publicá', 'recibí', 'registrá', 'revisá',
  'seleccioná', 'subí', 'vení', 'volvé',
  // adverbio rioplatense
  'acá',
]

const SOURCES = import.meta.glob(
  ['/src/pages/**/*.tsx', '/src/components/**/*.tsx', '/src/auth/**/*.{ts,tsx}', '/src/lib/**/*.ts', '/src/api/**/*.ts'],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>

// Los comentarios del código no son texto de la interfaz. Se conservan los saltos de línea para que los
// números de línea del reporte sean exactos. (Recorrido simple, sin regex: evita el backtracking.)
function withoutComments(source: string): string {
  let out = ''
  let i = 0
  while (i < source.length) {
    if (source.startsWith('/*', i)) {
      const close = source.indexOf('*/', i + 2)
      const stop = close === -1 ? source.length : close + 2
      out += '\n'.repeat(source.slice(i, stop).split('\n').length - 1)
      i = stop
    } else if (source.startsWith('//', i) && source[i - 1] !== ':') {
      const eol = source.indexOf('\n', i)
      i = eol === -1 ? source.length : eol
    } else {
      out += source[i]
      i += 1
    }
  }
  return out
}

// Los límites de palabra de JS no entienden las tildes: se usan letras Unicode.
const voseoRegex = new RegExp(`(?<![\\p{L}])(${VOSEO.join('|')})(?![\\p{L}])`, 'giu')

describe('texto de la interfaz en tuteo (UX-3)', () => {
  const files = Object.entries(SOURCES).filter(([path]) => !path.includes('.spec.'))

  it('encuentra los archivos de la interfaz', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('no contiene voseo', () => {
    const found = files.flatMap(([path, source]) =>
      withoutComments(source)
        .split('\n')
        .flatMap((line, index) => [...line.matchAll(voseoRegex)].map((m) => `${path}:${index + 1} «${m[0]}»`)),
    )

    expect(found).toEqual([])
  })

  it('la lista de palabras detecta voseo de verdad (guarda del propio test)', () => {
    expect('Entrá a tu cuenta'.match(voseoRegex)).toEqual(['Entrá'])
    expect('aparece acá'.match(voseoRegex)).toEqual(['acá'])
    expect('Si cerrás sesión'.match(voseoRegex)).toEqual(['cerrás'])
  })

  it('no se confunde con palabras correctas que se parecen', () => {
    expect('Entra a tu cuenta, aquí está tu sesión; además, publicarás'.match(voseoRegex)).toBeNull()
  })
})
