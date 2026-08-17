import { act, render, screen } from '@testing-library/react'
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
    it('searches accent-insensitively with every token across fields and preserves the query after cancel', async () => {
        const user = userEvent.setup()
        const props = services([
            record,
            {
                ...record,
                id: 'abcd-1234-full',
                institution: 'Éxito Norte',
                municipality: 'Medellín',
                department: 'Antioquia',
                visitDate: '2026-08-10',
                createdBy: { name: 'José Pérez', email: 'jose@example.com' },
            },
        ])
        render(<AdminRecords {...props} getAssessment={vi.fn()} updateAssessment={vi.fn()} />)
        const search = await screen.findByRole('searchbox', { name: 'Buscar registros' })
        await user.type(search, 'medellin jose 2026-08-10')
        expect(screen.getByText('1 / 2 registros')).toBeInTheDocument()
        expect(screen.getByText('Éxito Norte')).toBeInTheDocument()
        expect(screen.queryByText('Coliseo Central')).not.toBeInTheDocument()
        await user.clear(search)
        await user.type(search, 'abcd-1234-full')
        expect(screen.getByText('Éxito Norte')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Limpiar búsqueda' }))
        expect(search).toHaveValue('')
        expect(screen.getByText('2 / 2 registros')).toBeInTheDocument()
    })

    it('opens the editor from a row and returns to the same filtered list on cancel', async () => {
        const user = userEvent.setup()
        const props = services()
        render(
            <AdminRecords
                {...props}
                getAssessment={vi.fn().mockReturnValue(new Promise(() => {}))}
                updateAssessment={vi.fn()}
            />,
        )
        await screen.findByText('Coliseo Central')
        await user.type(screen.getByRole('searchbox', { name: 'Buscar registros' }), 'coliseo')
        await user.click(screen.getByRole('button', { name: 'Editar Coliseo Central' }))
        expect(await screen.findByText('Cargando evaluación…')).toBeInTheDocument()
        await user.click(screen.getByRole('button', { name: 'Volver a registros' }))
        expect(screen.getByRole('searchbox', { name: 'Buscar registros' })).toHaveValue('coliseo')
    })
    it('offers the global CSV and one PDF action per ready record', async () => {
        const props = services()
        render(<AdminRecords {...props} />)

        expect(await screen.findByText('Coliseo Central')).toBeInTheDocument()
        expect(screen.getByRole('columnheader', { name: 'Descarga' })).toBeInTheDocument()
        expect(
            screen.getByRole('button', { name: 'Descargar PDF de Coliseo Central' }),
        ).toBeEnabled()
        expect(screen.getByRole('button', { name: 'Descargar todos en CSV' })).toBeEnabled()
        const rowActions = screen.getByRole('button', {
            name: 'Editar Coliseo Central',
        }).parentElement
        expect(rowActions).toHaveClass('record-row-actions')
        expect(rowActions).toContainElement(
            screen.getByRole('button', { name: 'Descargar PDF de Coliseo Central' }),
        )
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
        expect(button).toHaveAttribute('aria-label', 'Descargando PDF de Coliseo Central')
        expect(button).toHaveAttribute('aria-busy', 'true')
        await user.click(button)
        expect(props.downloadPdf).toHaveBeenCalledOnce()
        expect(props.downloadPdf).toHaveBeenCalledWith('assessment/id', expect.any(AbortSignal))

        finishDownload()
        expect(await screen.findByRole('status')).toHaveTextContent(
            'PDF de Coliseo Central descargado.',
        )
        expect(button).toBeEnabled()
    })

    it('prevents two PDF activations batched in the same render', async () => {
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

        act(() => {
            button.click()
            button.click()
        })

        expect(props.downloadPdf).toHaveBeenCalledOnce()
        await act(async () => finishDownload())
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

    it('keeps CSV locked after authorization and accurately announces that download only started', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true })
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
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
        expect(button).toHaveAttribute('aria-busy', 'true')
        await user.click(button)
        expect(props.downloadCsv).toHaveBeenCalledOnce()

        finishDownload()
        expect(await screen.findByRole('status')).toHaveTextContent(
            'Descarga autorizada e iniciada; revisá las descargas del navegador.',
        )
        expect(button).toBeDisabled()

        await vi.advanceTimersByTimeAsync(9_999)
        expect(button).toBeDisabled()
        await vi.advanceTimersByTimeAsync(1)
        expect(button).toBeEnabled()
        vi.useRealTimers()
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

    it('aborts in-flight downloads and disposes native frames when unmounted', async () => {
        const user = userEvent.setup()
        let pdfSignal: AbortSignal | undefined
        let csvSignal: AbortSignal | undefined
        const dispose = vi.fn()
        const props = services()
        props.downloadPdf.mockImplementation((_id, signal) => {
            pdfSignal = signal
            return new Promise<void>(() => {})
        })
        props.downloadCsv.mockImplementation((signal) => {
            csvSignal = signal
            return Promise.resolve({ dispose })
        })
        const view = render(<AdminRecords {...props} />)

        await user.click(
            await screen.findByRole('button', { name: 'Descargar PDF de Coliseo Central' }),
        )
        await user.click(screen.getByRole('button', { name: 'Descargar todos en CSV' }))
        await screen.findByRole('status')
        view.unmount()

        expect(pdfSignal?.aborted).toBe(true)
        expect(csvSignal?.aborted).toBe(true)
        expect(dispose).toHaveBeenCalledOnce()
    })
})
