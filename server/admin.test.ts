import { EventEmitter } from 'node:events'
import type { AddressInfo } from 'node:net'
import express from 'express'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ASSESSMENT_CRITERIA, type AssessmentSubmission } from '../shared/assessment.js'
import {
    type AdminAssessmentRepository,
    type AdminSessionResolver,
    CURRENT_ASSESSMENT_FORM_VERSION,
    createAdminRouter,
    streamAssessmentCsv,
} from './admin.js'
import type { AssessmentCsvRecord, AssessmentPdfRecord } from './assessment-exports.js'

type AdminAssessment = {
    id: string
    institution: string
    visitDate: string
    municipality: string
    department: string
    createdAt: string
    createdBy: { name: string; email: string }
    responseCount: number
}

type AdminUser = {
    id: string
    name: string
    email: string
    role: 'evaluator' | 'super_admin'
    createdAt: string
}

type AdminUserService = {
    list: () => Promise<AdminUser[]>
    create: (input: { name: string; email: string; password: string }) => Promise<AdminUser>
    updatePassword: (userId: string, password: string) => Promise<void>
    promote: (userId: string) => Promise<AdminUser>
}

type ConfigurableAdminRouter = (options: {
    sessionResolver: AdminSessionResolver
    assessmentRepository: AdminAssessmentRepository
    userService?: AdminUserService
    pdfGenerator?: (record: AssessmentPdfRecord) => Promise<Uint8Array>
}) => ReturnType<typeof createAdminRouter>

const openServers: ReturnType<ReturnType<typeof express>['listen']>[] = []

afterEach(async () => {
    await Promise.all(
        openServers
            .splice(0)
            .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
    )
    vi.restoreAllMocks()
})

async function startAdminApi(options: Parameters<ConfigurableAdminRouter>[0]) {
    const app = express()
    app.use('/api/admin', (createAdminRouter as ConfigurableAdminRouter)(options))
    const server = app.listen(0, '127.0.0.1')
    openServers.push(server)
    await new Promise<void>((resolve) => server.once('listening', resolve))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin`
}

function adminSession(): ReturnType<AdminSessionResolver> {
    return Promise.resolve({ user: { id: 'admin-1', role: 'super_admin' } })
}

function evaluatorSession(): ReturnType<AdminSessionResolver> {
    return Promise.resolve({ user: { id: 'user-1', role: 'evaluator' } })
}

function exportRecord(overrides: Partial<AssessmentPdfRecord> = {}): AssessmentPdfRecord {
    return {
        id: '9f3c0dc7-c892-4a7f-8130-8df6f65a8547',
        formVersion: '2026-08-10',
        institution: 'Coliseo Central',
        visitDate: '2026-08-15',
        municipality: 'Pereira',
        department: 'Risaralda',
        contactName: 'Marta Díaz',
        contactRole: 'Coordinadora',
        phone: '3001234567',
        email: 'marta@example.com',
        protectionRiskDetails: '',
        generalObservations: '',
        visitors: ['Ana Torres'],
        createdAt: new Date('2026-08-15T20:00:00.000Z'),
        createdBy: 'Ana Torres <ana@example.com>',
        responses: [],
        photos: [],
        ...overrides,
    }
}

function assessmentRepository(
    overrides: Partial<AdminAssessmentRepository> = {},
): AdminAssessmentRepository {
    return {
        list: vi.fn().mockResolvedValue([]),
        streamCsvBatches: vi.fn(async function* () {}),
        findDetailed: vi.fn().mockResolvedValue(null),
        findEditable: vi.fn().mockResolvedValue({ status: 'not_found' }),
        update: vi.fn().mockResolvedValue({ status: 'not_found' }),
        ...overrides,
    }
}

function editableAssessment(): AssessmentSubmission {
    return {
        institution: 'Coliseo Central',
        visitDate: '2026-08-15',
        municipality: 'PEREIRA',
        department: 'RISARALDA',
        contactName: 'Marta Díaz',
        contactRole: 'Coordinadora',
        phone: '3001234567',
        email: 'marta@example.com',
        protectionRiskDetails: '',
        generalObservations: '',
        visitors: ['Ana Torres'],
        photos: [],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes' as const,
            comments: '',
            quantities: {},
        })),
    }
}

describe('super admin API', () => {
    it('denies an evaluator access before reading protected records', async () => {
        const list = vi.fn().mockResolvedValue([])
        const url = await startAdminApi({
            sessionResolver: evaluatorSession,
            assessmentRepository: assessmentRepository({ list }),
        })

        const response = await fetch(`${url}/assessments`)

        expect(response.status).toBe(403)
        expect(await response.json()).toEqual({ error: 'Super admin access required' })
        expect(list).not.toHaveBeenCalled()
    })

    it('lists assessment summaries for a super admin', async () => {
        const records: AdminAssessment[] = [
            {
                id: 'assessment-1',
                institution: 'Coliseo Central',
                visitDate: '2026-08-15',
                municipality: 'Pereira',
                department: 'Risaralda',
                createdAt: '2026-08-15T20:00:00.000Z',
                createdBy: { name: 'Ana Torres', email: 'ana@example.com' },
                responseCount: 44,
            },
        ]
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: assessmentRepository({
                list: vi.fn().mockResolvedValue(records),
            }),
        })

        const response = await fetch(`${url}/assessments`)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ records })
    })

    it('lists users for a super admin', async () => {
        const users: AdminUser[] = [
            {
                id: 'user-1',
                name: 'Ana Torres',
                email: 'ana@example.com',
                role: 'evaluator',
                createdAt: '2026-08-15T20:00:00.000Z',
            },
        ]
        const userService: AdminUserService = {
            list: vi.fn().mockResolvedValue(users),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: assessmentRepository(),
            userService,
        })

        const response = await fetch(`${url}/users`)

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ users })
        expect(userService.list).toHaveBeenCalledOnce()
    })

    it('creates an evaluator with normalized details', async () => {
        const created: AdminUser = {
            id: 'user-2',
            name: 'Luis Campo',
            email: 'luis@example.com',
            role: 'evaluator',
            createdAt: '2026-08-15T21:00:00.000Z',
        }
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn().mockResolvedValue(created),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: assessmentRepository(),
            userService,
        })

        const response = await fetch(`${url}/users`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: '  Luis Campo ',
                email: ' LUIS@EXAMPLE.COM ',
                password: 'segura-123',
            }),
        })

        expect(response.status).toBe(201)
        expect(await response.json()).toEqual({ user: created })
        expect(userService.create).toHaveBeenCalledWith({
            name: 'Luis Campo',
            email: 'luis@example.com',
            password: 'segura-123',
        })
    })

    it('rejects an overlong user password before account creation', async () => {
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: assessmentRepository(),
            userService,
        })

        const response = await fetch(`${url}/users`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                name: 'Luis Campo',
                email: 'luis@example.com',
                password: 'x'.repeat(129),
            }),
        })

        expect(response.status).toBe(400)
        expect(userService.create).not.toHaveBeenCalled()
    })

    it('updates a user password without returning it', async () => {
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn().mockResolvedValue(undefined),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: assessmentRepository(),
            userService,
        })

        const response = await fetch(`${url}/users/user-1/password`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: 'nueva-segura-456' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ success: true })
        expect(userService.updatePassword).toHaveBeenCalledWith('user-1', 'nueva-segura-456')
    })

    it('promotes an evaluator to super admin', async () => {
        const promoted: AdminUser = {
            id: 'user-1',
            name: 'Ana Torres',
            email: 'ana@example.com',
            role: 'super_admin',
            createdAt: '2026-08-15T20:00:00.000Z',
        }
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn().mockResolvedValue(promoted),
        }
        const url = await startAdminApi({
            sessionResolver: adminSession,
            assessmentRepository: assessmentRepository(),
            userService,
        })

        const response = await fetch(`${url}/users/user-1/role`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'super_admin' }),
        })

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({ user: promoted })
        expect(userService.promote).toHaveBeenCalledWith('user-1')
    })

    it('denies evaluator access to user administration', async () => {
        const userService: AdminUserService = {
            list: vi.fn(),
            create: vi.fn(),
            updatePassword: vi.fn(),
            promote: vi.fn(),
        }
        const url = await startAdminApi({
            sessionResolver: evaluatorSession,
            assessmentRepository: assessmentRepository(),
            userService,
        })

        const response = await fetch(`${url}/users`)

        expect(response.status).toBe(403)
        expect(userService.list).not.toHaveBeenCalled()
    })

    describe('assessment CSV export', () => {
        it.each([
            ['anonymous', () => Promise.resolve(null), 401],
            ['evaluator', evaluatorSession, 403],
        ])(
            'denies %s requests without opening the export iterator',
            async (_name, resolver, status) => {
                const streamCsvBatches = vi.fn(async function* () {
                    yield { ...exportRecord(), photoCount: 0 } satisfies AssessmentCsvRecord
                })
                const repository = assessmentRepository({ streamCsvBatches })
                const url = await startAdminApi({
                    sessionResolver: resolver,
                    assessmentRepository: repository,
                })

                const response = await fetch(`${url}/assessments.csv`)

                expect(response.status).toBe(status)
                expect(streamCsvBatches).not.toHaveBeenCalled()
                expect(repository.findDetailed).not.toHaveBeenCalled()
            },
        )

        it.each([
            ['anonymous', () => Promise.resolve(null), 401],
            ['evaluator', evaluatorSession, 403],
            ['super admin', adminSession, 200],
        ])(
            'handles HEAD for %s without opening the export iterator',
            async (_name, resolver, status) => {
                const streamCsvBatches = vi.fn(async function* () {})
                const repository = assessmentRepository({ streamCsvBatches })
                const url = await startAdminApi({
                    sessionResolver: resolver,
                    assessmentRepository: repository,
                })

                const response = await fetch(`${url}/assessments.csv`, { method: 'HEAD' })

                expect(response.status).toBe(status)
                expect(streamCsvBatches).not.toHaveBeenCalled()
            },
        )

        it('streams a UTF-8 CSV header and records with download-safe headers', async () => {
            const streamCsvBatches = vi.fn(async function* () {
                yield { ...exportRecord(), photoCount: 0 } satisfies AssessmentCsvRecord
            })
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({ streamCsvBatches }),
            })

            const response = await fetch(`${url}/assessments.csv`)
            const bytes = new Uint8Array(await response.arrayBuffer())
            const body = new TextDecoder().decode(bytes)

            expect(response.status).toBe(200)
            expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8')
            expect(response.headers.get('content-disposition')).toMatch(
                /^attachment; filename="evaluaciones-albergues-\d{4}-\d{2}-\d{2}\.csv"$/,
            )
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
            expect(body).toContain('id_evaluacion,version_formulario')
            expect(body).toContain('Coliseo Central')
            expect(streamCsvBatches).toHaveBeenCalledOnce()
        })

        it('returns only the CSV header when there are no assessments', async () => {
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository(),
            })

            const response = await fetch(`${url}/assessments.csv`)
            const bytes = new Uint8Array(await response.arrayBuffer())
            const body = new TextDecoder().decode(bytes)

            expect(response.status).toBe(200)
            expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
            expect(body).toMatch(/^id_evaluacion,version_formulario/)
            expect(body.trim().split('\n')).toHaveLength(1)
        })

        it('returns JSON 500 when iteration fails before CSV headers are committed', async () => {
            const streamCsvBatches = vi.fn(async function* () {
                yield await Promise.reject(new Error('database unavailable'))
            })
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({ streamCsvBatches }),
            })

            const response = await fetch(`${url}/assessments.csv`)

            expect(response.status).toBe(500)
            expect(await response.json()).toEqual({ error: 'Unable to export assessments' })
        })

        it('terminates the response when iteration fails after CSV headers are committed', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            const streamCsvBatches = vi.fn(async function* () {
                yield { ...exportRecord(), photoCount: 0 } satisfies AssessmentCsvRecord
                throw new Error('database interrupted')
            })
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({ streamCsvBatches }),
            })

            await expect(fetch(`${url}/assessments.csv`)).rejects.toThrow()
            expect(consoleError).toHaveBeenCalledWith(
                'Unable to export shelter assessments',
                expect.any(Error),
            )
        })

        it('waits for drain before writing the next CSV record', async () => {
            const response = Object.assign(new EventEmitter(), {
                write: vi
                    .fn()
                    .mockReturnValueOnce(true)
                    .mockReturnValueOnce(false)
                    .mockReturnValue(true),
                end: vi.fn(),
                setHeader: vi.fn(),
                destroyed: false,
                writableEnded: false,
            })
            const records = [
                { ...exportRecord(), photoCount: 0 },
                { ...exportRecord({ id: 'a07c72c1-e86e-4bca-94ac-ea8f67f95cb2' }), photoCount: 0 },
            ] satisfies AssessmentCsvRecord[]
            let completed = false

            const streaming = streamAssessmentCsv(
                response as never,
                (async function* () {
                    yield* records
                })(),
            ).then(() => {
                completed = true
            })
            await new Promise((resolve) => setTimeout(resolve, 0))

            expect(response.write).toHaveBeenCalledTimes(2)
            expect(completed).toBe(false)
            response.emit('drain')
            await streaming
            expect(response.write).toHaveBeenCalledTimes(3)
            expect(response.end).toHaveBeenCalledOnce()
        })

        it('streams more than 4.5 MB as multiple writes instead of one full export buffer', async () => {
            const response = Object.assign(new EventEmitter(), {
                write: vi.fn().mockReturnValue(true),
                end: vi.fn(),
                setHeader: vi.fn(),
                destroyed: false,
                writableEnded: false,
            })
            const large = 'x'.repeat(50_000)
            const records = Array.from({ length: 100 }, (_, index) => ({
                ...exportRecord({
                    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                    generalObservations: large,
                }),
                photoCount: 0,
            })) satisfies AssessmentCsvRecord[]

            await streamAssessmentCsv(
                response as never,
                (async function* () {
                    yield* records
                })(),
            )

            const writes = response.write.mock.calls.map(([chunk]) => Buffer.byteLength(chunk))
            expect(writes.reduce((total, size) => total + size, 0)).toBeGreaterThan(4_500_000)
            expect(writes).toHaveLength(101)
            expect(Math.max(...writes)).toBeLessThan(4_500_000)
        }, 10_000)

        it('stops a backpressured stream when the client connection closes', async () => {
            const response = Object.assign(new EventEmitter(), {
                write: vi.fn().mockReturnValue(false),
                end: vi.fn(),
                setHeader: vi.fn(),
                destroyed: false,
                writableEnded: false,
            })
            const streaming = streamAssessmentCsv(response as never, (async function* () {})())
            await new Promise((resolve) => setTimeout(resolve, 0))

            response.destroyed = true
            response.emit('close')

            await expect(streaming).rejects.toThrow('Response closed')
            expect(response.end).not.toHaveBeenCalled()
        })

        it('stops before committing headers when the client closes during iterator.next', async () => {
            let releaseRecord: (() => void) | undefined
            const recordReady = new Promise<void>((resolve) => {
                releaseRecord = resolve
            })
            const response = Object.assign(new EventEmitter(), {
                write: vi.fn().mockReturnValue(true),
                end: vi.fn(),
                setHeader: vi.fn(),
                destroyed: false,
                writableEnded: false,
            })
            const streaming = streamAssessmentCsv(
                response as never,
                (async function* () {
                    await recordReady
                    yield { ...exportRecord(), photoCount: 0 } satisfies AssessmentCsvRecord
                })(),
            )
            await new Promise((resolve) => setTimeout(resolve, 0))

            response.destroyed = true
            response.emit('close')
            releaseRecord?.()

            await expect(streaming).rejects.toThrow('Response closed')
            expect(response.setHeader).not.toHaveBeenCalled()
            expect(response.write).not.toHaveBeenCalled()
        })
    })

    describe('assessment PDF export', () => {
        it.each([
            ['anonymous', () => Promise.resolve(null), 401],
            ['evaluator', evaluatorSession, 403],
        ])('denies %s requests before reading an assessment', async (_name, resolver, status) => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: resolver,
                assessmentRepository: repository,
            })

            const response = await fetch(
                `${url}/assessments/9f3c0dc7-c892-4a7f-8130-8df6f65a8547.pdf`,
            )

            expect(response.status).toBe(status)
            expect(repository.findDetailed).not.toHaveBeenCalled()
        })

        it('rejects malformed assessment IDs before reading the repository', async () => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
            })

            const response = await fetch(`${url}/assessments/not-a-uuid.pdf`)

            expect(response.status).toBe(400)
            expect(await response.json()).toEqual({ error: 'Invalid assessment ID' })
            expect(repository.findDetailed).not.toHaveBeenCalled()
        })

        it('returns 404 when the assessment does not exist', async () => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
            })

            const response = await fetch(
                `${url}/assessments/9f3c0dc7-c892-4a7f-8130-8df6f65a8547.pdf`,
            )

            expect(response.status).toBe(404)
            expect(await response.json()).toEqual({ error: 'Assessment not found' })
        })

        it('generates an attached PDF for a detailed assessment', async () => {
            const record = exportRecord()
            const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])
            const pdfGenerator = vi.fn().mockResolvedValue(pdf)
            const repository = assessmentRepository({
                findDetailed: vi.fn().mockResolvedValue(record),
            })
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
                pdfGenerator,
            })

            const response = await fetch(`${url}/assessments/${record.id}.pdf`)

            expect(response.status).toBe(200)
            expect(response.headers.get('content-type')).toBe('application/pdf')
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect(response.headers.get('content-disposition')).toBe(
                `attachment; filename="evaluacion-${record.id}.pdf"`,
            )
            expect(new Uint8Array(await response.arrayBuffer())).toEqual(pdf)
            expect(repository.findDetailed).toHaveBeenCalledWith(record.id)
            expect(pdfGenerator).toHaveBeenCalledWith(record)
        })

        it.each([
            [
                'repository',
                assessmentRepository({ findDetailed: vi.fn().mockRejectedValue(new Error('db')) }),
                vi.fn(),
            ],
            [
                'generator',
                assessmentRepository({ findDetailed: vi.fn().mockResolvedValue(exportRecord()) }),
                vi.fn().mockRejectedValue(new Error('pdf')),
            ],
        ])('returns JSON 500 when the %s fails', async (_name, repository, pdfGenerator) => {
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
                pdfGenerator,
            })

            const response = await fetch(
                `${url}/assessments/9f3c0dc7-c892-4a7f-8130-8df6f65a8547.pdf`,
            )

            expect(response.status).toBe(500)
            expect(await response.json()).toEqual({ error: 'Unable to export assessment' })
        })
    })

    describe('assessment editing API', () => {
        const id = '9f3c0dc7-c892-4a7f-8130-8df6f65a8547'
        const revision = '2026-08-16 08:15:30.123456-05'

        it.each([
            ['anonymous', () => Promise.resolve(null), 401],
            ['evaluator', evaluatorSession, 403],
        ])('authenticates %s before parsing malformed JSON', async (_name, resolver, status) => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: resolver,
                assessmentRepository: repository,
            })

            const response = await fetch(`${url}/assessments/${id}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: '{',
            })

            expect(response.status).toBe(status)
            expect(repository.update).not.toHaveBeenCalled()
        })

        it('returns an explicit editable allowlist with canonical photos', async () => {
            const assessment = editableAssessment()
            const findEditable = vi.fn().mockResolvedValue({
                status: 'found',
                record: {
                    id,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    revision,
                    createdAt: '2026-08-15T20:00:00.000Z',
                    createdBy: { name: 'Ana Torres', email: 'ana@example.com' },
                    assessment,
                    photos: [
                        {
                            position: 0,
                            mimeType: 'image/jpeg',
                            size: 4,
                            data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]),
                            internalId: 'must-not-leak',
                        },
                    ],
                    internalForeignKey: 'must-not-leak',
                },
            })
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({ findEditable }),
            })

            const response = await fetch(`${url}/assessments/${id}`)

            expect(response.status).toBe(200)
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect(await response.json()).toEqual({
                record: {
                    id,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    revision,
                    createdAt: '2026-08-15T20:00:00.000Z',
                    createdBy: { name: 'Ana Torres', email: 'ana@example.com' },
                    assessment: {
                        ...assessment,
                        photos: [
                            {
                                position: 0,
                                mimeType: 'image/jpeg',
                                size: 4,
                                data: '/9j/2Q==',
                            },
                        ],
                    },
                },
            })
        })

        it.each([
            ['missing', { status: 'not_found' }, 404],
            ['historical', { status: 'unsupported' }, 409],
        ])('maps a %s editable lookup without leaking a record', async (_name, result, status) => {
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({
                    findEditable: vi.fn().mockResolvedValue(result),
                }),
            })

            const response = await fetch(`${url}/assessments/${id}`)

            expect(response.status).toBe(status)
            expect(response.headers.get('cache-control')).toBe('private, no-store')
            expect(await response.json()).toHaveProperty('error')
        })

        it('rejects an invalid edit ID without reading the repository', async () => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
            })

            const response = await fetch(`${url}/assessments/not-a-uuid`)

            expect(response.status).toBe(400)
            expect(repository.findEditable).not.toHaveBeenCalled()
        })

        it('rejects an invalid PUT ID without updating the repository', async () => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
            })

            const response = await fetch(`${url}/assessments/not-a-uuid`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    revision,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableAssessment(),
                }),
            })

            expect(response.status).toBe(400)
            expect(await response.json()).toEqual({
                error: 'El identificador de la evaluación no es válido',
            })
            expect(repository.update).not.toHaveBeenCalled()
        })

        it('leaves the PDF route ahead of the editable record route', async () => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
            })

            const response = await fetch(`${url}/assessments/${id}.pdf`)

            expect(response.status).toBe(404)
            expect(repository.findDetailed).toHaveBeenCalledWith(id)
            expect(repository.findEditable).not.toHaveBeenCalled()
        })

        it('validates and updates a current assessment', async () => {
            const assessment = editableAssessment()
            const update = vi.fn().mockResolvedValue({
                status: 'updated',
                revision: '2026-08-16 08:16:00-05',
            })
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({ update }),
            })

            const response = await fetch(`${url}/assessments/${id}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    revision,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment,
                }),
            })

            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({
                id,
                revision: '2026-08-16 08:16:00-05',
            })
            expect(update).toHaveBeenCalledWith({
                id,
                revision,
                formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                assessment,
            })
        })

        it.each([
            ['not found', { status: 'not_found' }, 404],
            ['unsupported', { status: 'unsupported' }, 409],
            ['conflict', { status: 'conflict' }, 409],
        ])('maps update result %s', async (_name, result, status) => {
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({
                    update: vi.fn().mockResolvedValue(result),
                }),
            })

            const response = await fetch(`${url}/assessments/${id}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    revision,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableAssessment(),
                }),
            })

            expect(response.status).toBe(status)
            expect(await response.json()).toHaveProperty('error')
        })

        it.each([
            ['non-object body', [], 400],
            [
                'bad version',
                { revision, formVersion: '2099-01-01', assessment: editableAssessment() },
                400,
            ],
            [
                'non-string revision',
                {
                    revision: 123,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableAssessment(),
                },
                400,
            ],
            [
                'overlong revision',
                {
                    revision: 'x'.repeat(65),
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableAssessment(),
                },
                400,
            ],
            [
                'malformed revision',
                {
                    revision: '2026-08-16T13:15:30Z',
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableAssessment(),
                },
                400,
            ],
            [
                'invalid assessment',
                { revision, formVersion: CURRENT_ASSESSMENT_FORM_VERSION, assessment: {} },
                400,
            ],
        ])('rejects %s before updating', async (_name, body, status) => {
            const repository = assessmentRepository()
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: repository,
            })

            const response = await fetch(`${url}/assessments/${id}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(body),
            })

            expect(response.status).toBe(status)
            expect(repository.update).not.toHaveBeenCalled()
        })

        it('returns Spanish JSON for authorized malformed JSON', async () => {
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository(),
            })

            const response = await fetch(`${url}/assessments/${id}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: '{',
            })

            expect(response.status).toBe(400)
            expect(await response.json()).toEqual({ error: 'El contenido JSON no es válido' })
        })

        it('returns sanitized JSON 500 when loading the editable record fails', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            const secret = 'database-password-must-not-leak'
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({
                    findEditable: vi.fn().mockRejectedValue(new Error(secret)),
                }),
            })

            const response = await fetch(`${url}/assessments/${id}`)
            const body = await response.text()

            expect(response.status).toBe(500)
            expect(response.headers.get('content-type')).toMatch(/^application\/json/)
            expect(JSON.parse(body)).toEqual({ error: 'No fue posible cargar la evaluación' })
            expect(body).not.toContain(secret)
            expect(consoleError).toHaveBeenCalledOnce()
        })

        it('returns sanitized JSON 500 when updating the editable record fails', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
            const secret = 'connection-string-must-not-leak'
            const url = await startAdminApi({
                sessionResolver: adminSession,
                assessmentRepository: assessmentRepository({
                    update: vi.fn().mockRejectedValue(new Error(secret)),
                }),
            })

            const response = await fetch(`${url}/assessments/${id}`, {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    revision,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableAssessment(),
                }),
            })
            const body = await response.text()

            expect(response.status).toBe(500)
            expect(response.headers.get('content-type')).toMatch(/^application\/json/)
            expect(JSON.parse(body)).toEqual({ error: 'No fue posible actualizar la evaluación' })
            expect(body).not.toContain(secret)
            expect(consoleError).toHaveBeenCalledOnce()
        })
    })
})
