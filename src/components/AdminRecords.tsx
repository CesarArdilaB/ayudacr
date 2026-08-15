import { useEffect, useState } from 'react'
import type { AdminAssessment } from '../lib/admin-api.js'

export function AdminRecords({
    loadRecords,
}: {
    loadRecords: () => Promise<{ records: AdminAssessment[] }>
}) {
    const [records, setRecords] = useState<AdminAssessment[]>([])
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

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

    return (
        <section className="admin-surface" aria-labelledby="records-title">
            <header className="admin-title-row">
                <div>
                    <p className="eyebrow">Control de información</p>
                    <h1 id="records-title">Registros capturados</h1>
                    <p>Visitas guardadas por los equipos de evaluación en terreno.</p>
                </div>
                <div className="record-total">
                    <strong>{records.length}</strong>
                    <span>registros</span>
                </div>
            </header>

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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    )
}
