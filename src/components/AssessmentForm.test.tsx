import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AssessmentSubmission } from '../../shared/assessment.js'
import { AssessmentForm } from './AssessmentForm'

async function completeAssessment(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Institución visitada'), 'Coliseo El Pueblo')
    await user.clear(screen.getByLabelText('Fecha de la visita'))
    await user.type(screen.getByLabelText('Fecha de la visita'), '2026-08-15')
    await user.selectOptions(screen.getByLabelText('Departamento'), 'VALLE DEL CAUCA')
    await user.selectOptions(screen.getByLabelText('Municipio'), 'CALI')
    await user.type(screen.getByLabelText('Persona de contacto'), 'Ana Torres')
    await user.click(screen.getByRole('button', { name: 'Comenzar evaluación' }))

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
    it('starts with the shelter and visit identification fields', () => {
        render(<AssessmentForm onSubmit={async () => ({ id: 'assessment-1' })} />)

        expect(
            screen.getByRole('heading', { name: 'Información del alojamiento' }),
        ).toBeInTheDocument()
        expect(screen.getByLabelText('Institución visitada')).toBeInTheDocument()
        expect(screen.getByLabelText('Municipio')).toBeInTheDocument()
        expect(screen.getByLabelText('Departamento')).toBeInTheDocument()
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
                expect.objectContaining({ criterionKey: 'dignity_pregnant', answer: 'yes' }),
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
})
