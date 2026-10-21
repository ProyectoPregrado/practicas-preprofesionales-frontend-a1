import { ScanSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type DocumentCheckResult, checkDocument } from '@/api/ai'
import { Button } from '@/components/ui/button'
import { describeError } from '@/lib/describeError'
import { AiModeTag, HintDot } from './HintDot'

function ExtractedFacts({ extracted }: { extracted: NonNullable<DocumentCheckResult['extracted']> }) {
  const rows: [string, string][] = [
    ['A nombre de', extracted.personName],
    ['Empresa', extracted.companyName],
    ['Vigencia', [extracted.validFrom, extracted.validTo].filter(Boolean).join(' → ')],
    ['Número', extracted.policyNumber],
  ]
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-13">
      {rows
        .filter(([, value]) => value)
        .map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-inkSoft">{label}</dt>
            <dd className="font-data text-ink">{value}</dd>
          </div>
        ))}
    </dl>
  )
}

/**
 * IA-1: la IA lee el convenio o el seguro y avisa si no cuadra con la práctica (vence antes, otro nombre, otra
 * empresa, otro tipo de documento). Se pide al pulsar: cuesta una llamada y no hace falta en cada vistazo.
 */
export function DocumentCheckPanel({ documentId }: { documentId: number }) {
  const [result, setResult] = useState<DocumentCheckResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setResult(null)
    setError(null)
  }, [documentId])

  async function run() {
    setLoading(true)
    setError(null)
    try {
      setResult(await checkDocument(documentId))
    } catch (err) {
      setError(describeError(err, { forbidden: 'No puedes revisar este documento.' }) ?? 'No se pudo revisar el documento.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section aria-label="Revisión del documento" className="flex flex-col gap-2 rounded-xl bg-hero/60 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <ScanSearch aria-hidden="true" className="size-4 text-stamp" />
        <span className="flex-1 font-display text-14 font-semibold text-ink">¿Cuadra con la práctica?</span>
        {result ? <AiModeTag aiUsed={result.aiUsed} /> : null}
        <Button type="button" size="sm" variant="outline" onClick={run} disabled={loading}>
          {loading ? 'Leyendo el documento…' : 'Revisar con IA'}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-12 text-void">
          {error}
        </p>
      ) : null}
      {result ? (
        <>
          {result.extracted?.summary ? <p className="text-13 text-inkBody">{result.extracted.summary}</p> : null}
          <ul className="flex flex-col gap-1.5">
            {result.findings.map((finding) => (
              <li key={finding.message} className="flex items-start gap-2 text-13 text-inkBody">
                <HintDot level={finding.level} className="flex-none" />
                <span>{finding.message}</span>
              </li>
            ))}
          </ul>
          {result.extracted ? <ExtractedFacts extracted={result.extracted} /> : null}
        </>
      ) : null}
    </section>
  )
}
