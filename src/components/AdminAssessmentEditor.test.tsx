import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ASSESSMENT_CRITERIA } from '../../shared/assessment.js'
import type { AdminEditableAssessment } from '../lib/admin-api.js'
import { AdminAssessmentEditor } from './AdminAssessmentEditor.js'

const record: AdminEditableAssessment = {
    id: 'record-1',
    revision: 'revision-1',
    formVersion: '2026-08-10',
    createdAt: '2026-08-16',
    createdBy: { name: 'Ana', email: 'ana@example.com' },
    assessment: {
        institution: 'Coliseo',
        visitDate: '2026-08-10',
        municipality: 'CALI',
        department: 'VALLE DEL CAUCA',
        contactName: 'Ana',
        contactRole: '',
        phone: '',
        email: '',
        protectionRiskDetails: '',
        generalObservations: '',
        visitors: [],
        photos: [],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes',
            comments: '',
            quantities: {},
        })),
    },
}

describe('AdminAssessmentEditor', () => {
    it('retries a failed detail load and renders the successful record', async () => {
        const user = userEvent.setup()
        const getAssessment = vi
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ record })
        render(
            <AdminAssessmentEditor
                assessmentId={record.id}
                getAssessment={getAssessment}
                updateAssessment={vi.fn()}
                onCancel={vi.fn()}
                onSaved={vi.fn()}
                onDirtyChange={vi.fn()}
                onSavingChange={vi.fn()}
            />,
        )

        expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar')
        await user.click(screen.getByRole('button', { name: 'Reintentar' }))
        expect(await screen.findByDisplayValue('Coliseo')).toBeInTheDocument()
        expect(getAssessment).toHaveBeenCalledTimes(2)
    })

    it.each(['conflicto de revisión', 'falla temporal'])(
        'preserves fields and photos after %s and permits retry',
        async (message) => {
            const user = userEvent.setup()
            const withPhoto = {
                ...record,
                assessment: {
                    ...record.assessment,
                    photos: [{ data: '/9j/AAAA/9k=', mimeType: 'image/jpeg' as const, size: 8 }],
                },
            }
            const updateAssessment = vi
                .fn()
                .mockRejectedValueOnce(new Error(message))
                .mockResolvedValueOnce({ id: record.id, revision: 'revision-2' })
            const onSaved = vi.fn()
            render(
                <AdminAssessmentEditor
                    assessmentId={record.id}
                    getAssessment={vi.fn().mockResolvedValue({ record: withPhoto })}
                    updateAssessment={updateAssessment}
                    onCancel={vi.fn()}
                    onSaved={onSaved}
                    onDirtyChange={vi.fn()}
                    onSavingChange={vi.fn()}
                />,
            )

            const institution = await screen.findByLabelText('Institución visitada')
            await user.type(institution, ' editado')
            await user.click(screen.getByRole('button', { name: 'Revisión final' }))
            expect(screen.getByAltText('Evidencia fotográfica 1')).toBeInTheDocument()
            await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
            expect(await screen.findByRole('alert')).toHaveTextContent(message)
            expect(screen.getByAltText('Evidencia fotográfica 1')).toBeInTheDocument()
            await user.click(screen.getByRole('button', { name: 'Datos del alojamiento' }))
            expect(screen.getByLabelText('Institución visitada')).toHaveValue('Coliseo editado')
            await user.click(screen.getByRole('button', { name: 'Revisión final' }))
            await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
            expect(updateAssessment).toHaveBeenCalledTimes(2)
            expect(onSaved).toHaveBeenCalledOnce()
        },
    )
    it('loads the detail and saves with its captured revision', async () => {
        const user = userEvent.setup()
        const getAssessment = vi.fn().mockResolvedValue({ record })
        const updateAssessment = vi
            .fn()
            .mockResolvedValue({ id: record.id, revision: 'revision-2' })
        const onSaved = vi.fn()
        const onSavingChange = vi.fn()
        render(
            <AdminAssessmentEditor
                assessmentId={record.id}
                getAssessment={getAssessment}
                updateAssessment={updateAssessment}
                onCancel={vi.fn()}
                onSaved={onSaved}
                onDirtyChange={vi.fn()}
                onSavingChange={onSavingChange}
            />,
        )

        expect(await screen.findByDisplayValue('Coliseo')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Revisión final' }))
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
        expect(updateAssessment).toHaveBeenCalledWith(
            record.id,
            expect.objectContaining({ revision: 'revision-1', formVersion: '2026-08-10' }),
        )
        expect(onSaved).toHaveBeenCalledOnce()
        expect(onSavingChange).toHaveBeenCalledWith(true)
        expect(onSavingChange).toHaveBeenLastCalledWith(false)
    })

    it('aborts and ignores a detail load that resolves after cancellation', async () => {
        const user = userEvent.setup()
        let signal: AbortSignal | undefined
        let resolveLoad: ((value: { record: AdminEditableAssessment }) => void) | undefined
        const getAssessment = vi.fn((_id, passedSignal) => {
            signal = passedSignal
            return new Promise<{ record: AdminEditableAssessment }>((resolve) => {
                resolveLoad = resolve
            })
        })
        const onCancel = vi.fn()
        render(
            <AdminAssessmentEditor
                assessmentId={record.id}
                getAssessment={getAssessment}
                updateAssessment={vi.fn()}
                onCancel={onCancel}
                onSaved={vi.fn()}
                onDirtyChange={vi.fn()}
                onSavingChange={vi.fn()}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Volver a registros' }))
        expect(signal?.aborted).toBe(true)
        expect(onCancel).toHaveBeenCalledOnce()
        resolveLoad?.({ record })
        await Promise.resolve()
        expect(screen.queryByDisplayValue('Coliseo')).not.toBeInTheDocument()
    })

    it('aborts and ignores a detail load that resolves after unmount', async () => {
        let signal: AbortSignal | undefined
        let resolveLoad: ((value: { record: AdminEditableAssessment }) => void) | undefined
        const view = render(
            <AdminAssessmentEditor
                assessmentId={record.id}
                getAssessment={vi.fn((_id, passedSignal) => {
                    signal = passedSignal
                    return new Promise<{ record: AdminEditableAssessment }>((resolve) => {
                        resolveLoad = resolve
                    })
                })}
                updateAssessment={vi.fn()}
                onCancel={vi.fn()}
                onSaved={vi.fn()}
                onDirtyChange={vi.fn()}
                onSavingChange={vi.fn()}
            />,
        )
        view.unmount()
        expect(signal?.aborted).toBe(true)
        resolveLoad?.({ record })
        await Promise.resolve()
        expect(screen.queryByDisplayValue('Coliseo')).not.toBeInTheDocument()
    })
})
