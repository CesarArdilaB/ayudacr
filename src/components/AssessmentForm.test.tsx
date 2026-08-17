import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ASSESSMENT_CRITERIA, type AssessmentSubmission } from '../../shared/assessment.js'
import { AssessmentForm, createAssessmentDirtySnapshot } from './AssessmentForm'

function emptyCompleteSubmission(): AssessmentSubmission {
    return {
        institution: 'Albergue',
        visitDate: '2026-08-10',
        municipality: 'CALI',
        department: 'VALLE DEL CAUCA',
        contactName: 'Contacto',
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
    }
}

async function completeAssessment(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Institución visitada'), 'Coliseo El Pueblo')
    await user.clear(screen.getByLabelText('Fecha de la visita'))
    await user.type(screen.getByLabelText('Fecha de la visita'), '2026-08-15')
    await user.selectOptions(screen.getByLabelText('Departamento'), 'VALLE DEL CAUCA')
    await user.selectOptions(screen.getByLabelText('Municipio'), 'CALI')
    await user.type(screen.getByLabelText('Persona de contacto'), 'Ana Torres')
    await user.click(screen.getByRole('button', { name: 'Comenzar evaluación' }))

    await user.type(screen.getByLabelText('Cantidad de mujeres gestantes o lactantes'), '3')
    await user.type(screen.getByLabelText('Cantidad de personas mayores'), '7')
    await user.type(screen.getByLabelText('Cantidad de personas con discapacidad'), '2')
    await user.type(screen.getByLabelText('Cantidad de niñas, niños y adolescentes'), '12')
    await user.type(screen.getByLabelText('Cantidad de personas de grupos étnicos'), '4')
    await user.type(screen.getByLabelText('Cantidad de hombres'), '18')
    await user.type(screen.getByLabelText('Cantidad de mujeres'), '22')

    const sectionHeadings = [
        'Dignidad y grupos con necesidades específicas de protección',
        'Acceso',
        'Participación',
        'Seguridad',
        'Principales riesgos de protección identificados',
        'Alertas inmediatas',
    ]

    for (const [index, heading] of sectionHeadings.entries()) {
        expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
        for (const yesOption of screen.getAllByRole('radio', { name: 'Sí' })) {
            await user.click(yesOption)
        }
        await user.click(
            screen.getByRole('button', {
                name:
                    index === sectionHeadings.length - 1
                        ? 'Revisar evaluación'
                        : 'Siguiente sección',
            }),
        )
    }
}

describe('AssessmentForm', () => {
    it('marks only edit navigation for compact direct access on mobile and tablet', () => {
        const { rerender } = render(
            <AssessmentForm
                mode="edit"
                initialSubmission={emptyCompleteSubmission()}
                onSubmit={async () => ({ id: '1' })}
            />,
        )
        expect(
            screen.getByRole('navigation', { name: 'Secciones de la evaluación' }).closest('aside'),
        ).toHaveClass('edit-step-navigation')
        expect(screen.getAllByRole('button', { name: /Acceso|Participación/ })[0]).toHaveClass(
            'edit-step-link',
        )

        rerender(<AssessmentForm onSubmit={async () => ({ id: '1' })} />)
        expect(
            screen.getByRole('navigation', { name: 'Secciones de la evaluación' }).closest('aside'),
        ).not.toHaveClass('edit-step-navigation')
    })

    it('builds a lightweight dirty snapshot without serializing photo base64', () => {
        const submission = {
            ...emptyCompleteSubmission(),
            photos: [
                {
                    data: `SECRET-${'A'.repeat(500_000)}`,
                    mimeType: 'image/jpeg' as const,
                    size: 500_007,
                },
            ],
        }
        const snapshot = createAssessmentDirtySnapshot(submission, ['stored-0:image/jpeg:500007'])

        expect(snapshot).not.toContain('SECRET')
        expect(snapshot.length).toBeLessThan(20_000)
        expect(snapshot).toContain('stored-0')
    })

    it('tracks adding and removing a new photo using its lightweight identity', async () => {
        const user = userEvent.setup()
        const onDirtyChange = vi.fn()
        render(
            <AssessmentForm
                mode="edit"
                initialSubmission={emptyCompleteSubmission()}
                onDirtyChange={onDirtyChange}
                photoPreparer={vi
                    .fn()
                    .mockResolvedValue({
                        data: `UNSERIALIZED-${'A'.repeat(100_000)}`,
                        mimeType: 'image/jpeg',
                        size: 100_013,
                    })}
                onSubmit={async () => ({ id: '1' })}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Revisión final' }))
        await user.upload(
            screen.getByLabelText('Agregar fotos'),
            new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }),
        )
        expect(await screen.findByAltText('Evidencia fotográfica 1')).toBeInTheDocument()
        expect(onDirtyChange).toHaveBeenLastCalledWith(true)
        await user.click(screen.getByRole('button', { name: 'Eliminar foto 1' }))
        expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })
    it('initializes every editable field and allows direct section navigation', async () => {
        const user = userEvent.setup()
        const initialSubmission: AssessmentSubmission = {
            institution: 'Albergue Éxito',
            visitDate: '2026-08-10',
            municipality: 'CALI',
            department: 'VALLE DEL CAUCA',
            contactName: 'Natalia',
            contactRole: 'Líder',
            phone: '300',
            email: 'natalia@example.com',
            protectionRiskDetails: 'Riesgo',
            generalObservations: 'Observación',
            visitors: ['Ana', 'Luis'],
            photos: [{ data: '/9j/AAAA/9k=', mimeType: 'image/jpeg', size: 8 }],
            responses: ASSESSMENT_CRITERIA.map((criterion) => ({
                criterionKey: criterion.key,
                answer: 'yes' as const,
                comments: `Nota ${criterion.key}`,
                quantities: Object.fromEntries(
                    (criterion.quantityFields ?? []).map((field) => [field.key, 7]),
                ),
            })),
        }
        render(
            <AssessmentForm
                mode="edit"
                initialSubmission={initialSubmission}
                onSubmit={async () => ({ id: '1' })}
            />,
        )

        expect(screen.getByRole('heading', { name: 'Editar evaluación' })).toBeInTheDocument()
        expect(screen.getByLabelText('Institución visitada')).toHaveValue('Albergue Éxito')
        expect(screen.getByText('44', { selector: '.rail-count strong' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Participación' }))
        expect(screen.getByRole('heading', { name: 'Participación' })).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Revisión final' }))
        expect(screen.getByAltText('Evidencia fotográfica 1')).toBeInTheDocument()
    })

    it('warns only when cancelling a dirty edit and clears dirty before success callback', async () => {
        const user = userEvent.setup()
        const onCancel = vi.fn()
        const onSaved = vi.fn()
        const onDirtyChange = vi.fn()
        const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
        render(
            <AssessmentForm
                mode="edit"
                initialSubmission={{ ...emptyCompleteSubmission(), institution: 'Original' }}
                onSubmit={async () => ({ id: '1' })}
                onCancel={onCancel}
                onSaved={onSaved}
                onDirtyChange={onDirtyChange}
            />,
        )

        await user.click(screen.getByRole('button', { name: 'Cancelar edición' }))
        expect(confirm).not.toHaveBeenCalled()
        expect(onCancel).toHaveBeenCalledOnce()
        onCancel.mockClear()
        await user.type(screen.getByLabelText('Institución visitada'), ' cambio')
        await user.click(screen.getByRole('button', { name: 'Cancelar edición' }))
        expect(confirm).toHaveBeenCalledOnce()
        expect(onCancel).not.toHaveBeenCalled()

        await user.click(screen.getByRole('button', { name: 'Revisión final' }))
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
        expect(onSaved).toHaveBeenCalledOnce()
        expect(onDirtyChange).toHaveBeenLastCalledWith(false)
    })

    it('registers beforeunload protection only while an edit is dirty', async () => {
        const user = userEvent.setup()
        render(
            <AssessmentForm
                mode="edit"
                initialSubmission={emptyCompleteSubmission()}
                onSubmit={async () => ({ id: '1' })}
            />,
        )
        const cleanEvent = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(cleanEvent)
        expect(cleanEvent.defaultPrevented).toBe(false)
        await user.type(screen.getByLabelText('Institución visitada'), ' cambio')
        const dirtyEvent = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(dirtyEvent)
        expect(dirtyEvent.defaultPrevented).toBe(true)
    })

    it('locks the complete edit and reports saving until a pending update succeeds', async () => {
        const user = userEvent.setup()
        let resolveSave: ((value: { id: string }) => void) | undefined
        let submitted: AssessmentSubmission | undefined
        const onCancel = vi.fn()
        const onSaved = vi.fn()
        const onSavingChange = vi.fn()
        render(
            <AssessmentForm
                mode="edit"
                initialSubmission={emptyCompleteSubmission()}
                onCancel={onCancel}
                onSaved={onSaved}
                onSavingChange={onSavingChange}
                onSubmit={(value) => {
                    submitted = value
                    return new Promise((resolve) => {
                        resolveSave = resolve
                    })
                }}
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Revisión final' }))
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))

        expect(screen.getByLabelText('Evaluación de alojamiento temporal')).toHaveAttribute(
            'aria-busy',
            'true',
        )
        expect(screen.getByRole('button', { name: 'Cancelar edición' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Datos del alojamiento' })).toBeDisabled()
        expect(screen.getByRole('button', { name: 'Alertas inmediatas' })).toBeDisabled()
        expect(screen.getByRole('button', { name: '← Volver a alertas' })).toBeDisabled()
        expect(screen.getByLabelText('Agregar fotos')).toBeDisabled()
        expect(onSavingChange).toHaveBeenLastCalledWith(true)
        const savingEvent = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(savingEvent)
        expect(savingEvent.defaultPrevented).toBe(true)

        await user.click(screen.getByRole('button', { name: 'Datos del alojamiento' }))
        expect(screen.getByRole('heading', { name: 'Revisión final' })).toBeInTheDocument()
        expect(submitted?.institution).toBe('Albergue')
        expect(onCancel).not.toHaveBeenCalled()

        resolveSave?.({ id: 'record-1' })
        expect(await screen.findByRole('button', { name: 'Cambios guardados' })).toBeDisabled()
        expect(onSavingChange).toHaveBeenLastCalledWith(false)
        expect(onSaved).toHaveBeenCalledOnce()
    })

    it('ignores a late save completion after unmount and clears the saving signal', async () => {
        const user = userEvent.setup()
        let resolveSave: ((value: { id: string }) => void) | undefined
        const onSaved = vi.fn()
        const onSavingChange = vi.fn()
        const view = render(
            <AssessmentForm
                mode="edit"
                initialSubmission={emptyCompleteSubmission()}
                onSaved={onSaved}
                onSavingChange={onSavingChange}
                onSubmit={() =>
                    new Promise((resolve) => {
                        resolveSave = resolve
                    })
                }
            />,
        )
        await user.click(screen.getByRole('button', { name: 'Revisión final' }))
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }))
        view.unmount()
        resolveSave?.({ id: 'record-1' })
        await Promise.resolve()

        expect(onSaved).not.toHaveBeenCalled()
        expect(onSavingChange).toHaveBeenLastCalledWith(false)
    })
    it('starts with the shelter and visit identification fields', () => {
        render(<AssessmentForm onSubmit={async () => ({ id: 'assessment-1' })} />)

        expect(
            screen.getByRole('heading', { name: 'Información del alojamiento' }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText('Institución visitada')).toBeInTheDocument()
        expect(screen.getByLabelText('Municipio')).toBeInTheDocument()
        expect(screen.getByLabelText('Departamento')).toBeInTheDocument()
        expect(screen.getByLabelText('Institución visitada')).toHaveAttribute('maxlength', '200')
    })

    it('does not advance when required shelter details are missing', async () => {
        const user = userEvent.setup()
        render(<AssessmentForm onSubmit={async () => ({ id: 'assessment-1' })} />)

        await user.click(screen.getByRole('button', { name: 'Comenzar evaluación' }))

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Completá los campos obligatorios antes de continuar.',
        )
        expect(
            screen.getByRole('heading', { name: 'Información del alojamiento' }),
        ).toBeInTheDocument()
    })

    it('only offers municipalities from the selected department', async () => {
        const user = userEvent.setup()
        render(<AssessmentForm onSubmit={async () => ({ id: 'assessment-1' })} />)

        const department = screen.getByRole('combobox', { name: 'Departamento' })
        const municipality = screen.getByRole('combobox', { name: 'Municipio' })

        expect(municipality).toBeDisabled()
        await user.selectOptions(department, 'ANTIOQUIA')

        expect(municipality).toBeEnabled()
        expect(screen.getByRole('option', { name: 'MEDELLÍN' })).toBeInTheDocument()
        expect(screen.queryByRole('option', { name: 'CALI' })).not.toBeInTheDocument()

        await user.selectOptions(department, 'VALLE DEL CAUCA')
        expect(municipality).toHaveValue('')
        expect(screen.getByRole('option', { name: 'CALI' })).toBeInTheDocument()
    })

    it('does not advance with a malformed optional contact email', async () => {
        const user = userEvent.setup()
        render(<AssessmentForm onSubmit={async () => ({ id: 'assessment-1' })} />)

        await user.type(screen.getByLabelText('Institución visitada'), 'Coliseo El Pueblo')
        await user.selectOptions(screen.getByLabelText('Departamento'), 'VALLE DEL CAUCA')
        await user.selectOptions(screen.getByLabelText('Municipio'), 'CALI')
        await user.type(screen.getByLabelText('Persona de contacto'), 'Ana Torres')
        await user.type(screen.getByLabelText('Correo'), 'correo-invalido')
        await user.click(screen.getByRole('button', { name: 'Comenzar evaluación' }))

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Ingresá un correo válido o dejá el campo vacío.',
        )
        expect(
            screen.getByRole('heading', { name: 'Información del alojamiento' }),
        ).toBeInTheDocument()
    })

    it('captures every criterion and submits the reviewed assessment', async () => {
        const user = userEvent.setup()
        const scrollTo = vi.spyOn(window, 'scrollTo')
        let captured: AssessmentSubmission | undefined
        render(
            <AssessmentForm
                onSubmit={async (submission) => {
                    captured = submission
                    return { id: 'assessment-123' }
                }}
            />,
        )

        await completeAssessment(user)

        expect(screen.getByText('44 de 44 criterios respondidos')).toBeInTheDocument()
        scrollTo.mockClear()
        await user.click(screen.getByRole('button', { name: 'Guardar evaluación' }))

        expect(await screen.findByRole('status')).toHaveTextContent('Evaluación guardada')
        expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
        expect(screen.getByRole('button', { name: 'Evaluación guardada' })).toBeDisabled()
        expect(captured).toMatchObject({
            institution: 'Coliseo El Pueblo',
            municipality: 'CALI',
            department: 'VALLE DEL CAUCA',
            responses: expect.arrayContaining([
                expect.objectContaining({
                    criterionKey: 'dignity_pregnant',
                    answer: 'yes',
                    quantities: { people: 3 },
                }),
                expect.objectContaining({
                    criterionKey: 'dignity_population_total',
                    quantities: { men: 18, women: 22 },
                }),
            ]),
        })
        expect(captured?.responses).toHaveLength(44)
    })

    it('keeps the completed review available when saving fails', async () => {
        const user = userEvent.setup()
        render(
            <AssessmentForm
                onSubmit={async () => {
                    throw new Error('network unavailable')
                }}
            />,
        )

        await completeAssessment(user)
        await user.click(screen.getByRole('button', { name: 'Guardar evaluación' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('network unavailable')
        expect(screen.getByRole('heading', { name: 'Revisión final' })).toBeInTheDocument()
    })

    it('previews, removes, reselects and submits an optional photo', async () => {
        const user = userEvent.setup()
        const photo = {
            data: '/9j/AAAA/9k=',
            mimeType: 'image/jpeg' as const,
            size: 8,
        }
        const photoPreparer = vi.fn().mockResolvedValue(photo)
        let captured: AssessmentSubmission | undefined
        render(
            <AssessmentForm
                photoPreparer={photoPreparer}
                onSubmit={async (submission) => {
                    captured = submission
                    return { id: 'assessment-photo' }
                }}
            />,
        )
        await completeAssessment(user)
        const input = screen.getByLabelText('Agregar fotos')
        const file = new File(['camera bytes'], 'shelter.jpg', { type: 'image/jpeg' })

        await user.upload(input, file)
        expect(await screen.findByAltText('Evidencia fotográfica 1')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Eliminar foto 1' }))
        expect(screen.queryByAltText('Evidencia fotográfica 1')).not.toBeInTheDocument()

        await user.upload(input, file)
        expect(await screen.findByText('1 de 4 fotos agregadas')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Guardar evaluación' }))

        expect(captured?.photos).toEqual([photo])
        expect(photoPreparer).toHaveBeenCalledTimes(2)
    })

    it('keeps four prepared photos visible after a failed save', async () => {
        const user = userEvent.setup()
        const photoPreparer = vi.fn().mockResolvedValue({
            data: '/9j/AAAA/9k=',
            mimeType: 'image/jpeg',
            size: 8,
        })
        render(
            <AssessmentForm
                photoPreparer={photoPreparer}
                onSubmit={async () => {
                    throw new Error('network unavailable')
                }}
            />,
        )
        await completeAssessment(user)
        const files = Array.from(
            { length: 5 },
            (_, index) =>
                new File([`photo ${index}`], `photo-${index}.jpg`, { type: 'image/jpeg' }),
        )

        await user.upload(screen.getByLabelText('Agregar fotos'), files)
        expect(await screen.findByText('4 de 4 fotos agregadas')).toBeInTheDocument()
        expect(photoPreparer).toHaveBeenCalledTimes(4)
        await user.click(screen.getByRole('button', { name: 'Guardar evaluación' }))

        expect(await screen.findByRole('alert')).toHaveTextContent('network unavailable')
        expect(screen.getAllByRole('img', { name: /Evidencia fotográfica/ })).toHaveLength(4)
    })
})
