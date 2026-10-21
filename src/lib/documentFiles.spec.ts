import { describe, expect, it } from 'vitest'
import { MAX_DOCUMENT_BYTES, documentFileError, documentKindLabel, formatFileSize, previewKind } from './documentFiles'

describe('documentFileError (DOC-2)', () => {
  it('acepta PDF, PNG y JPG dentro del tope, sin importar mayúsculas', () => {
    for (const name of ['convenio.pdf', 'SEGURO.PDF', 'foto.png', 'scan.jpg', 'scan.jpeg']) {
      expect(documentFileError({ name, size: 1000 })).toBeNull()
    }
  })

  it('rechaza otros tipos, archivos vacíos y los de más de 10 MB', () => {
    expect(documentFileError({ name: 'informe.docx', size: 1000 })).toBe('Solo se aceptan PDF, PNG o JPG')
    expect(documentFileError({ name: 'convenio.pdf', size: 0 })).toBe('El archivo está vacío')
    expect(documentFileError({ name: 'convenio.pdf', size: MAX_DOCUMENT_BYTES + 1 })).toBe('El archivo supera los 10 MB')
    expect(documentFileError({ name: 'convenio.pdf', size: MAX_DOCUMENT_BYTES })).toBeNull()
  })
})

describe('formatFileSize', () => {
  it('muestra bytes, KB o MB con coma decimal', () => {
    expect(formatFileSize(512)).toBe('512 B')
    expect(formatFileSize(840 * 1024)).toBe('840 KB')
    expect(formatFileSize(1.25 * 1024 * 1024)).toBe('1,3 MB')
  })
})

describe('previewKind y documentKindLabel', () => {
  it('sabe qué se puede mostrar dentro de la app', () => {
    expect(previewKind('application/pdf')).toBe('pdf')
    expect(previewKind('image/jpeg')).toBe('image')
    expect(previewKind('application/zip')).toBe('none')
    expect(previewKind(undefined)).toBe('none')
  })

  it('traduce el tipo y deja igual uno desconocido', () => {
    expect(documentKindLabel('INSURANCE')).toBe('Seguro')
    expect(documentKindLabel('OTRO')).toBe('OTRO')
  })
})
