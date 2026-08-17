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

    it('aborts a late load when cancelled', async () => {
        const user = userEvent.setup()
        let signal: AbortSignal | undefined
        const getAssessment = vi.fn((_id, passedSignal) => {
            signal = passedSignal
            return new Promise<{ record: AdminEditableAssessment }>(() => {})
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
    })
})
