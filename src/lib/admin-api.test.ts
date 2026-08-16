import { afterEach, describe, expect, it, vi } from 'vitest'
import * as adminApi from './admin-api.js'

const { createEvaluator, listAdminUsers, promoteAdminUser, updateAdminUserPassword } =
    adminApi as typeof adminApi & {
        createEvaluator: (input: {
            name: string
            email: string
            password: string
        }) => Promise<unknown>
        listAdminUsers: () => Promise<{ users: unknown[] }>
        promoteAdminUser: (userId: string) => Promise<unknown>
        updateAdminUserPassword: (userId: string, password: string) => Promise<unknown>
    }

const { downloadAdminAssessmentPdf, downloadAdminAssessmentsCsv } = adminApi as typeof adminApi & {
    downloadAdminAssessmentPdf: (assessmentId: string) => Promise<void>
    downloadAdminAssessmentsCsv: () => Promise<void>
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    vi.useRealTimers()
    for (const frame of document.querySelectorAll('iframe[src="/api/admin/assessments.csv"]')) {
        frame.remove()
    }
})

function respond(body: unknown, status = 200) {
    return Promise.resolve(
        new Response(JSON.stringify(body), {
            status,
            headers: { 'content-type': 'application/json' },
        }),
    )
}

describe('admin user API', () => {
    it('lists users with authenticated credentials', async () => {
        const fetcher = vi.fn().mockImplementation(() => respond({ users: [] }))
        vi.stubGlobal('fetch', fetcher)

        await expect(listAdminUsers()).resolves.toEqual({ users: [] })
        expect(fetcher).toHaveBeenCalledWith('/api/admin/users', {
            credentials: 'include',
            headers: { accept: 'application/json' },
        })
    })

    it('creates an evaluator', async () => {
        const input = { name: 'Ana Torres', email: 'ana@example.com', password: 'segura-123' }
        const fetcher = vi.fn().mockImplementation(() =>
            respond({
                user: {
                    id: 'user-1',
                    name: input.name,
                    email: input.email,
                    role: 'evaluator',
                    createdAt: '2026-08-15T20:00:00.000Z',
                },
            }),
        )
        vi.stubGlobal('fetch', fetcher)

        await createEvaluator(input)

        expect(fetcher).toHaveBeenCalledWith('/api/admin/users', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        })
    })

    it('updates a selected user password', async () => {
        const fetcher = vi.fn().mockImplementation(() => respond({ success: true }))
        vi.stubGlobal('fetch', fetcher)

        await updateAdminUserPassword('user-1', 'nueva-segura-456')

        expect(fetcher).toHaveBeenCalledWith('/api/admin/users/user-1/password', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'nueva-segura-456' }),
        })
    })

    it('promotes a selected user to super admin', async () => {
        const fetcher = vi.fn().mockImplementation(() =>
            respond({
                user: {
                    id: 'user-1',
                    name: 'Ana Torres',
                    email: 'ana@example.com',
                    role: 'super_admin',
                    createdAt: '2026-08-15T20:00:00.000Z',
                },
            }),
        )
        vi.stubGlobal('fetch', fetcher)

        await promoteAdminUser('user-1')

        expect(fetcher).toHaveBeenCalledWith('/api/admin/users/user-1/role', {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'super_admin' }),
        })
    })

    it('returns a useful error when an upstream response is not JSON', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('Gateway unavailable', { status: 502 })),
        )

        await expect(listAdminUsers()).rejects.toThrow('La solicitud no pudo completarse.')
    })
})

describe('admin assessment downloads', () => {
    it('downloads an assessment PDF with credentials and a safe server filename', async () => {
        vi.useFakeTimers()
        const fetcher = vi.fn().mockResolvedValue(
            new Response(new Blob(['pdf']), {
                headers: {
                    'content-disposition':
                        "attachment; filename*=UTF-8''evaluaci%C3%B3n-coliseo.pdf",
                    'content-type': 'application/pdf',
                },
            }),
        )
        vi.stubGlobal('fetch', fetcher)
        const createObjectUrl = vi.fn().mockReturnValue('blob:assessment')
        const revokeObjectUrl = vi.fn()
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: createObjectUrl,
        })
        Object.defineProperty(URL, 'revokeObjectURL', {
            configurable: true,
            value: revokeObjectUrl,
        })
        let clickedAnchor: HTMLAnchorElement | undefined
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clickedAnchor = this
        })

        await downloadAdminAssessmentPdf('assessment/id')

        expect(fetcher).toHaveBeenCalledWith('/api/admin/assessments/assessment%2Fid.pdf', {
            credentials: 'include',
            headers: { accept: 'application/pdf' },
        })
        expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob))
        expect(click).toHaveBeenCalledOnce()
        expect(clickedAnchor?.download).toBe('evaluación-coliseo.pdf')
        expect(revokeObjectUrl).not.toHaveBeenCalled()
        expect(document.querySelector('a[download]')).toBeInTheDocument()

        vi.runAllTimers()
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:assessment')
        expect(document.querySelector('a[download]')).not.toBeInTheDocument()
    })

    it('uses a safe fallback when the PDF filename is unsafe', async () => {
        vi.useFakeTimers()
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(new Blob(['pdf']), {
                    headers: { 'content-disposition': 'attachment; filename="../../secret.pdf"' },
                }),
            ),
        )
        Object.defineProperty(URL, 'createObjectURL', {
            configurable: true,
            value: vi.fn().mockReturnValue('blob:assessment'),
        })
        Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
        let clickedAnchor: HTMLAnchorElement | undefined
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
            this: HTMLAnchorElement,
        ) {
            clickedAnchor = this
        })

        await downloadAdminAssessmentPdf('record-42')

        expect(clickedAnchor?.download).toBe('evaluacion-record-42.pdf')
        vi.runAllTimers()
    })

    it.each([
        [401, 'Tu sesión expiró. Ingresá nuevamente.'],
        [403, 'No tenés permisos para descargar este archivo.'],
        [404, 'No se encontró el registro solicitado.'],
        [500, 'No fue posible descargar el archivo. Intentá nuevamente.'],
    ])('reports a Spanish PDF error for HTTP %s', async (status, message) => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response(JSON.stringify({ error: 'Upstream detail' }), {
                    status,
                    headers: { 'content-type': 'application/json' },
                }),
            ),
        )

        await expect(downloadAdminAssessmentPdf('record-42')).rejects.toThrow(message)
    })

    it('reports a Spanish PDF error when the response is not JSON', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('Gateway unavailable', { status: 502 })),
        )

        await expect(downloadAdminAssessmentPdf('record-42')).rejects.toThrow(
            'No fue posible descargar el archivo. Intentá nuevamente.',
        )
    })

    it('checks CSV access with credentials before starting a native streaming download', async () => {
        vi.useFakeTimers()
        const fetcher = vi.fn().mockResolvedValue(new Response(null, { status: 200 }))
        vi.stubGlobal('fetch', fetcher)

        await downloadAdminAssessmentsCsv()

        expect(fetcher).toHaveBeenCalledWith('/api/admin/assessments.csv', {
            method: 'HEAD',
            credentials: 'include',
        })
        const frame = document.querySelector<HTMLIFrameElement>(
            'iframe[src="/api/admin/assessments.csv"]',
        )
        expect(frame).toBeInTheDocument()
        expect(frame).toHaveAttribute('aria-hidden', 'true')

        vi.advanceTimersByTime(60_000)
        expect(frame).toBeInTheDocument()

        vi.advanceTimersByTime(5 * 60_000)
        expect(frame).not.toBeInTheDocument()
        vi.useRealTimers()
    })

    it('does not create a CSV iframe when the access check fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })),
        )

        await expect(downloadAdminAssessmentsCsv()).rejects.toThrow(
            'No tenés permisos para descargar este archivo.',
        )
        expect(document.querySelector('iframe[src="/api/admin/assessments.csv"]')).toBeNull()
    })
})
