import { useCallback, useEffect, useRef, useState } from 'react'
import {
    type AdminAssessmentUpdate,
    type AdminEditableAssessment,
    getAdminAssessment,
    updateAdminAssessment,
} from '../lib/admin-api.js'
import { AssessmentForm } from './AssessmentForm.js'

export function AdminAssessmentEditor({
    assessmentId,
    getAssessment = getAdminAssessment,
    updateAssessment = updateAdminAssessment,
    onCancel,
    onSaved,
    onDirtyChange,
}: {
    assessmentId: string
    getAssessment?: (
        id: string,
        signal?: AbortSignal,
    ) => Promise<{ record: AdminEditableAssessment }>
    updateAssessment?: (
        id: string,
        input: AdminAssessmentUpdate,
    ) => Promise<{ id: string; revision: string }>
    onCancel: () => void
    onSaved: () => void
    onDirtyChange: (dirty: boolean) => void
}) {
    const [record, setRecord] = useState<AdminEditableAssessment>()
    const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
    const controllerRef = useRef<AbortController | undefined>(undefined)
    const requestNumberRef = useRef(0)

    const load = useCallback(() => {
        controllerRef.current?.abort()
        const controller = new AbortController()
        controllerRef.current = controller
        const requestNumber = ++requestNumberRef.current
        setStatus('loading')
        void getAssessment(assessmentId, controller.signal)
            .then(({ record: loaded }) => {
                if (controller.signal.aborted || requestNumber !== requestNumberRef.current) return
                setRecord(loaded)
                setStatus('ready')
            })
            .catch(() => {
                if (!controller.signal.aborted && requestNumber === requestNumberRef.current)
                    setStatus('error')
            })
    }, [assessmentId, getAssessment])

    useEffect(() => {
        load()
        return () => controllerRef.current?.abort()
    }, [load])

    function cancel() {
        controllerRef.current?.abort()
        onDirtyChange(false)
        onCancel()
    }

    if (status === 'loading') {
        return (
            <section className="admin-surface editor-state" aria-label="Cargando evaluación">
                <p role="status">Cargando evaluación…</p>
                <button type="button" className="assessment-secondary" onClick={cancel}>
                    Volver a registros
                </button>
            </section>
        )
    }
    if (status === 'error' || !record) {
        return (
            <section className="admin-surface editor-state">
                <p className="server-error" role="alert">
                    No fue posible cargar la evaluación.
                </p>
                <div className="editor-state-actions">
                    <button type="button" className="assessment-primary" onClick={load}>
                        Reintentar
                    </button>
                    <button type="button" className="assessment-secondary" onClick={cancel}>
                        Volver a registros
                    </button>
                </div>
            </section>
        )
    }

    return (
        <AssessmentForm
            key={`${record.id}:${record.revision}`}
            mode="edit"
            initialSubmission={record.assessment}
            onDirtyChange={onDirtyChange}
            onCancel={cancel}
            onSaved={() => onSaved()}
            onSubmit={(assessment) =>
                updateAssessment(record.id, {
                    revision: record.revision,
                    formVersion: record.formVersion,
                    assessment,
                })
            }
        />
    )
}
