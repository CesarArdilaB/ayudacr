import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AdminAssessment } from '../lib/admin-api.js'
import { AdminRecords } from './AdminRecords.js'

const record: AdminAssessment = {
    id: 'assessment/id',
    institution: 'Coliseo Central',
    visitDate: '2026-08-15',
    municipality: 'Pereira',
    department: 'Risaralda',
    createdAt: '2026-08-15T20:00:00.000Z',
    createdBy: { name: 'Ana Torres', email: 'ana@example.com' },
    responseCount: 44,
}

function services(records = [record]) {
    return {
        loadRecords: vi.fn().mockResolvedValue({ records }),
        downloadPdf: vi.fn().mockResolvedValue(undefined),
        downloadCsv: vi.fn().mockResolvedValue(undefined),
    }
}

describe('AdminRecords exports', () => {
    it('offers the global CSV and one PDF action per ready record', async () => {
        const props = services()
        render(<AdminRecords {...props} />)

        expect(await screen.findByText('Coliseo Central')).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Descarga' })).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Descargar PDF de Coliseo Central' }),
        ).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Descargar todos en CSV' })).toBeEnabled()
    })

    it('keeps CSV available when there are no records', async () => {
        render(<AdminRecords {...services([])} />)

        expect(await screen.findByText('Aún no hay evaluaciones')).toBeInTheDocument()
        expect(screen.getByRole('button', { name: 'Descargar todos en CSV' })).toBeEnabled()
    })

    it('disables CSV while records load and after loading fails', async () => {
        let rejectLoad: (reason?: unknown) => void = () => {}
        const pending = new Promise<{ records: AdminAssessment[] }>((_resolve, reject) => {
            rejectLoad = reject
        })
        const props = services()
        props.loadRecords.mockReturnValue(pending)
        render(<AdminRecords {...props} />)

        expect(screen.getByRole('button', { name: 'Descargar todos en CSV' })).toBeDisabled()
        rejectLoad(new Error('offline'))

        expect(await screen.findByRole('alert')).toHaveTextContent('No fue posible cargar')
        expect(screen.getByRole('button', { name: 'Descargar todos en CSV' })).toBeDisabled()
    })

    it('prevents duplicate PDF clicks and announces success', async () => {
        const user = userEvent.setup()
        let finishDownload: () => void = () => {}
        const props = services()
        props.downloadPdf.mockReturnValue(
            new Promise<void>((resolve) => {
                finishDownload = resolve
            }),
        )
        render(<AdminRecords {...props} />)
        const button = await screen.findByRole('button', {
            name: 'Descargar PDF de Coliseo Central',
        })

        await user.click(button)
        expect(button).toBeDisabled()
        expect(button).toHaveTextContent('Descargando…')
        await user.click(button)
        expect(props.downloadPdf).toHaveBeenCalledOnce()
        expect(props.downloadPdf).toHaveBeenCalledWith('assessment/id')

        finishDownload()
        expect(await screen.findByRole('status')).toHaveTextContent(
            'PDF de Coliseo Central descargado.',
        )
        expect(button).toBeEnabled()
    })

    it('announces PDF download errors and re-enables the record action', async () => {
        const user = userEvent.setup()
        const props = services()
        props.downloadPdf.mockRejectedValue(new Error('No se encontró el registro solicitado.'))
        render(<AdminRecords {...props} />)
        const button = await screen.findByRole('button', {
            name: 'Descargar PDF de Coliseo Central',
        })

        await user.click(button)

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'No se encontró el registro solicitado.',
        )
        expect(button).toBeEnabled()
    })

    it('prevents duplicate CSV clicks and lets the API create the streaming iframe', async () => {
        const user = userEvent.setup()
        let finishDownload: () => void = () => {}
        const props = services([])
        props.downloadCsv.mockReturnValue(
            new Promise<void>((resolve) => {
                finishDownload = resolve
            }),
        )
        render(<AdminRecords {...props} />)
        const button = await screen.findByRole('button', { name: 'Descargar todos en CSV' })

        await user.click(button)
        expect(button).toBeDisabled()
        expect(button).toHaveTextContent('Preparando CSV…')
        await user.click(button)
        expect(props.downloadCsv).toHaveBeenCalledOnce()

        finishDownload()
        expect(await screen.findByRole('status')).toHaveTextContent('Descarga CSV iniciada.')
        expect(button).toBeEnabled()
    })

    it('announces CSV errors and re-enables the global action', async () => {
        const user = userEvent.setup()
        const props = services([])
        props.downloadCsv.mockRejectedValue(
            new Error('No tenés permisos para descargar este archivo.'),
        )
        render(<AdminRecords {...props} />)
        const button = await screen.findByRole('button', { name: 'Descargar todos en CSV' })

        await user.click(button)

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'No tenés permisos para descargar este archivo.',
        )
        expect(button).toBeEnabled()
    })

    it('starts the default CSV streaming iframe without navigating the SPA', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 200 })))
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
        render(<AdminRecords loadRecords={services([]).loadRecords} />)
        const button = await screen.findByRole('button', { name: 'Descargar todos en CSV' })

        await user.click(button)

        expect(
            document.querySelector('iframe[src="/api/admin/assessments.csv"]'),
        ).toBeInTheDocument()
        expect(window.location.pathname).toBe('/')
        vi.clearAllTimers()
        document.querySelector('iframe[src="/api/admin/assessments.csv"]')?.remove()
        vi.useRealTimers()
    })
})
