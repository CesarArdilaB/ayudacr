import { useEffect, useRef, useState } from 'react'
import {
    type AdminAssessment,
    downloadAdminAssessmentPdf,
    downloadAdminAssessmentsCsv,
    type NativeDownloadHandle,
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
    downloadPdf?: (assessmentId: string, signal?: AbortSignal) => Promise<void>
    downloadCsv?: (signal?: AbortSignal) => Promise<NativeDownloadHandle | undefined>
}) {
    const [records, setRecords] = useState<AdminAssessment[]>([])
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const [pendingPdfIds, setPendingPdfIds] = useState<Set<string>>(() => new Set())
    const [csvPending, setCsvPending] = useState(false)
    const [csvAuthorized, setCsvAuthorized] = useState(false)
    const [downloadNotice, setDownloadNotice] = useState<{
        kind: 'success' | 'error'
        message: string
    } | null>(null)
    const mountedRef = useRef(true)
    const pendingPdfIdsRef = useRef(new Set<string>())
    const downloadControllersRef = useRef(new Set<AbortController>())
    const csvHandlesRef = useRef(new Set<NativeDownloadHandle>())
    const csvLockRef = useRef(false)
    const csvLockTimerRef = useRef<number | undefined>(undefined)

    useEffect(() => {
        mountedRef.current = true
        return () => {
            mountedRef.current = false
            if (csvLockTimerRef.current !== undefined) {
                window.clearTimeout(csvLockTimerRef.current)
            }
            for (const controller of downloadControllersRef.current) controller.abort()
            downloadControllersRef.current.clear()
            pendingPdfIdsRef.current.clear()
            for (const handle of csvHandlesRef.current) handle.dispose()
            csvHandlesRef.current.clear()
        }
    }, [])

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
        if (pendingPdfIdsRef.current.has(record.id)) return
        pendingPdfIdsRef.current.add(record.id)
        const controller = new AbortController()
        downloadControllersRef.current.add(controller)
        setPendingPdfIds((current) => new Set(current).add(record.id))
        setDownloadNotice(null)
        try {
            await downloadPdf(record.id, controller.signal)
            if (!mountedRef.current) return
            setDownloadNotice({
                kind: 'success',
                message: `PDF de ${record.institution} descargado.`,
            })
        } catch (error) {
            if (!mountedRef.current || controller.signal.aborted) return
            setDownloadNotice({ kind: 'error', message: messageFrom(error) })
        } finally {
            downloadControllersRef.current.delete(controller)
            pendingPdfIdsRef.current.delete(record.id)
            if (mountedRef.current) {
                setPendingPdfIds((current) => {
                    const next = new Set(current)
                    next.delete(record.id)
                    return next
                })
            }
        }
    }

    async function handleCsvDownload() {
        if (csvLockRef.current || status !== 'ready') return
        const controller = new AbortController()
        downloadControllersRef.current.add(controller)
        csvLockRef.current = true
        setCsvPending(true)
        setCsvAuthorized(false)
        setDownloadNotice(null)
        try {
            const handle = await downloadCsv(controller.signal)
            if (!mountedRef.current) {
                handle?.dispose()
                return
            }
            if (handle) csvHandlesRef.current.add(handle)
            setCsvAuthorized(true)
            setDownloadNotice({
                kind: 'success',
                message: 'Descarga autorizada e iniciada; revisá las descargas del navegador.',
            })
            csvLockTimerRef.current = window.setTimeout(() => {
                csvLockRef.current = false
                downloadControllersRef.current.delete(controller)
                if (!mountedRef.current) return
                setCsvPending(false)
                setCsvAuthorized(false)
            }, 10_000)
        } catch (error) {
            downloadControllersRef.current.delete(controller)
            csvLockRef.current = false
            if (!mountedRef.current || controller.signal.aborted) return
            setDownloadNotice({ kind: 'error', message: messageFrom(error) })
            setCsvPending(false)
            setCsvAuthorized(false)
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
                        aria-busy={csvPending}
                        onClick={() => void handleCsvDownload()}
                    >
                        {csvPending
                            ? csvAuthorized
                                ? 'Descarga iniciada…'
                                : 'Preparando CSV…'
                            : 'Descargar todos en CSV'}
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
                                            aria-label={`${
                                                pendingPdfIds.has(record.id)
                                                    ? 'Descargando'
                                                    : 'Descargar'
                                            } PDF de ${record.institution}`}
                                            aria-busy={pendingPdfIds.has(record.id)}
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
