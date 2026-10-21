import { describe, expect, it } from 'vitest'
import { csvFilename, toCsv } from './csv'

describe('toCsv (EXP-1)', () => {
  it('empieza con BOM, separa con comas y termina cada fila con CRLF', () => {
    expect(toCsv([['Fecha', 'Horas'], ['2026-03-05', 4.5]])).toBe('\uFEFFFecha,Horas\r\n2026-03-05,4.5\r\n')
  })

  it('entrecomilla lo que lleva coma, comillas o saltos de línea, y duplica las comillas', () => {
    expect(toCsv([['Soporte, redes', 'Dijo "listo"', 'línea 1\nlínea 2']])).toBe(
      '\uFEFF"Soporte, redes","Dijo ""listo""","línea 1\nlínea 2"\r\n',
    )
  })

  it('neutraliza texto que una hoja de cálculo ejecutaría como fórmula', () => {
    expect(toCsv([['=HYPERLINK("http://x")', '+1', '-2', '@SUM(A1)']])).toBe(
      `\uFEFF"'=HYPERLINK(""http://x"")",'+1,'-2,'@SUM(A1)\r\n`,
    )
  })

  it('deja vacíos los nulos y los números no finitos, y no toca los números negativos', () => {
    expect(toCsv([[null, undefined, Number.NaN, -3]])).toBe('\uFEFF,,,-3\r\n')
  })
})

describe('csvFilename', () => {
  it('arma un nombre sin tildes ni espacios con la fecha del día', () => {
    expect(csvFilename(['Acta', 'acreditación', '2026-1'], new Date(2026, 9, 21))).toBe('acta-acreditacion-2026-1-2026-10-21.csv')
    expect(csvFilename(['horas', 'estudiante', 22], new Date(2026, 0, 5))).toBe('horas-estudiante-22-2026-01-05.csv')
  })
})
