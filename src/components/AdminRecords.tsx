import { useEffect, useState } from 'react'
import {
    type AdminAssessment,
    downloadAdminAssessmentPdf,
    downloadAdminAssessmentsCsv,
} from '../lib/admin-api.js'

function messageFrom(error: unknown): string {
    return error instanceof Error
        ? error.message
        : 'No fue posible descargar el archivo. Intentá nuevamente.'
}

export function AdminRecords({
    loadRecords,
    downloadPdf = downloadAdminAssessmentPdf,
    downloadCsv = downloadAdminAssessmentsCsv,
}: {
    loadRecords: () => Promise<{ records: AdminAssessment[] }>
    downloadPdf?: (assessmentId: string) => Promise<void>
    downloadCsv?: () => Promise<void>
}) {
    const [records, setRecords] = useState<AdminAssessment[]>([])
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [pendingPdfIds, setPendingPdfIds] = useState<Set<string>>(() => new Set())
    const [csvPending, setCsvPending] = useState(false)
    const [downloadNotice, setDownloadNotice] = useState<{
        kind: 'success' | 'error'
        message: string
    } | null>(null)

    useEffect(() => {
        let active = true
        setStatus('loading')
        void loadRecords()
            .then((result) => {
                if (!active) return
                setRecords(result.records)
                setStatus('ready')
            })
            .catch(() => {
                if (active) setStatus('error')
            })
        return () => {
            active = false
        }
    }, [loadRecords])

    async function handlePdfDownload(record: AdminAssessment) {
        if (pendingPdfIds.has(record.id)) return
        setPendingPdfIds((current) => new Set(current).add(record.id))
        setDownloadNotice(null)
        try {
            await downloadPdf(record.id)
            setDownloadNotice({
                kind: 'success',
                message: `PDF de ${record.institution} descargado.`,
            })
        } catch (error) {
            setDownloadNotice({ kind: 'error', message: messageFrom(error) })
        } finally {
            setPendingPdfIds((current) => {
                const next = new Set(current)
                next.delete(record.id)
                return next
            })
        }
    }

    async function handleCsvDownload() {
        if (csvPending || status !== 'ready') return
        setCsvPending(true)
        setDownloadNotice(null)
        try {
            await downloadCsv()
            setDownloadNotice({ kind: 'success', message: 'Descarga CSV iniciada.' })
        } catch (error) {
            setDownloadNotice({ kind: 'error', message: messageFrom(error) })
        } finally {
            setCsvPending(false)
        }
    }

    return (
        <section className="admin-surface" aria-labelledby="records-title">
            <header className="admin-title-row">
                <div>
                    <p className="eyebrow">Control de información</p>
                    <h1 id="records-title">Registros capturados</h1>
                    <p>Visitas guardadas por los equipos de evaluación en terreno.</p>
                </div>
                <div className="records-summary-actions">
                    <div className="record-total">
                        <strong>{records.length}</strong>
                        <span>registros</span>
                    </div>
                    <button
                        className="records-download-all"
                        type="button"
                        disabled={status !== 'ready' || csvPending}
                        onClick={() => void handleCsvDownload()}
                    >
                        {csvPending ? 'Preparando CSV…' : 'Descargar todos en CSV'}
                    </button>
                </div>
            </header>

            {downloadNotice && (
                <p
                    className={downloadNotice.kind === 'error' ? 'server-error' : 'download-status'}
                    role={downloadNotice.kind === 'error' ? 'alert' : 'status'}
                >
                    {downloadNotice.message}
                </p>
            )}

            {status === 'loading' && <p role="status">Cargando registros…</p>}
            {status === 'error' && (
                <p className="server-error" role="alert">
                    No fue posible cargar los registros. Intentá nuevamente.
                </p>
            )}
            {status === 'ready' && records.length === 0 && (
                <div className="admin-empty">
                    <span aria-hidden="true">00</span>
                    <h2>Aún no hay evaluaciones</h2>
                    <p>Los formularios enviados aparecerán aquí.</p>
                </div>
            )}
            {status === 'ready' && records.length > 0 && (
                <div className="records-table-wrap">
                    <table className="records-table">
                        <thead>
                            <tr>
                                <th>Albergue</th>
                                <th>Ubicación</th>
                                <th>Visita</th>
                                <th>Evaluador</th>
                                <th>Respuestas</th>
                                <th>Descarga</th>
                            </tr>
                        </thead>
                        <tbody>
                            {records.map((record) => (
                                <tr key={record.id}>
                                    <td data-label="Albergue">
                                        <strong>{record.institution}</strong>
                                        <small>{record.id.slice(0, 8)}</small>
                                    </td>
                                    <td data-label="Ubicación">
                                        {record.municipality}
                                        <small>{record.department}</small>
                                    </td>
                                    <td data-label="Visita">{record.visitDate}</td>
                                    <td data-label="Evaluador">
                                        {record.createdBy.name}
                                        <small>{record.createdBy.email}</small>
                                    </td>
                                    <td data-label="Respuestas">
                                        <span className="completion-pill">
                                            {record.responseCount} / 44
                                        </span>
                                    </td>
                                    <td data-label="Descarga">
                                        <button
                                            className="record-download-button"
                                            type="button"
                                            disabled={pendingPdfIds.has(record.id)}
                                            aria-label={`Descargar PDF de ${record.institution}`}
                                            onClick={() => void handlePdfDownload(record)}
                                        >
                                            {pendingPdfIds.has(record.id)
                                                ? 'Descargando…'
                                                : 'Descargar PDF'}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}
