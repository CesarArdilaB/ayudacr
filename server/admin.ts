import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import { hashPassword } from 'better-auth/crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { and, asc, count, desc, eq, inArray, lt, or } from 'drizzle-orm'
import { type Response, Router } from 'express'
import {
    type AssessmentCsvRecord,
    type AssessmentPdfRecord,
    createAssessmentCsvChunk,
    createAssessmentCsvHeader,
    createAssessmentPdf,
} from './assessment-exports.js'
import { auth, createAuth, databasePool, serverConfig } from './auth.js'
import { db } from './db/index.js'
import {
    account,
    assessmentPhotos,
    assessmentResponses,
    session,
    shelterAssessments,
    user,
} from './db/schema.js'

export type AdminSession = {
    user: { id: string; role: 'evaluator' | 'super_admin' }
} | null

export type AdminSessionResolver = (headers: IncomingHttpHeaders) => Promise<AdminSession>

export type AdminAssessment = {
    id: string
    institution: string
    visitDate: string
    municipality: string
    department: string
    createdAt: string
    createdBy: { name: string; email: string }
    responseCount: number
}

export type AdminAssessmentRepository = {
    list(): Promise<AdminAssessment[]>
    streamCsvBatches(): AsyncIterable<AssessmentCsvRecord>
    findDetailed(id: string): Promise<AssessmentPdfRecord | null>
}

export type AdminUser = {
    id: string
    name: string
    email: string
    role: 'evaluator' | 'super_admin'
    createdAt: string
}

export type AdminUserService = {
    list(): Promise<AdminUser[]>
    create(input: { name: string; email: string; password: string }): Promise<AdminUser>
    updatePassword(userId: string, password: string): Promise<void>
    promote(userId: string): Promise<AdminUser>
}

class AdminUserNotFoundError extends Error {}

const betterAuthAdminSessionResolver: AdminSessionResolver = async (headers) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
    if (!session) return null

    return {
        user: {
            id: session.user.id,
            role: session.user.role === 'super_admin' ? 'super_admin' : 'evaluator',
        },
    }
}

export function createDrizzleAdminAssessmentRepository(
    database: typeof db = db,
): AdminAssessmentRepository {
    return {
        async list() {
            const records = await database
                .select({
                    id: shelterAssessments.id,
                    institution: shelterAssessments.institution,
                    visitDate: shelterAssessments.visitDate,
                    municipality: shelterAssessments.municipality,
                    department: shelterAssessments.department,
                    createdAt: shelterAssessments.createdAt,
                    creatorName: user.name,
                    creatorEmail: user.email,
                    responseCount: count(assessmentResponses.id),
                })
                .from(shelterAssessments)
                .innerJoin(user, eq(shelterAssessments.createdByUserId, user.id))
                .leftJoin(
                    assessmentResponses,
                    eq(assessmentResponses.assessmentId, shelterAssessments.id),
                )
                .groupBy(shelterAssessments.id, user.id)
                .orderBy(desc(shelterAssessments.createdAt))

            return records.map((record) => ({
                id: record.id,
                institution: record.institution,
                visitDate: record.visitDate,
                municipality: record.municipality,
                department: record.department,
                createdAt: record.createdAt.toISOString(),
                createdBy: { name: record.creatorName, email: record.creatorEmail },
                responseCount: record.responseCount,
            }))
        },
        async *streamCsvBatches() {
            const batchSize = 100
            let cursor: { createdAt: Date; id: string } | undefined
            while (true) {
                const records = await database
                    .select({
                        id: shelterAssessments.id,
                        formVersion: shelterAssessments.formVersion,
                        institution: shelterAssessments.institution,
                        visitDate: shelterAssessments.visitDate,
                        municipality: shelterAssessments.municipality,
                        department: shelterAssessments.department,
                        contactName: shelterAssessments.contactName,
                        contactRole: shelterAssessments.contactRole,
                        phone: shelterAssessments.phone,
                        email: shelterAssessments.email,
                        protectionRiskDetails: shelterAssessments.protectionRiskDetails,
                        generalObservations: shelterAssessments.generalObservations,
                        visitors: shelterAssessments.visitors,
                        createdAt: shelterAssessments.createdAt,
                        creatorName: user.name,
                        creatorEmail: user.email,
                    })
                    .from(shelterAssessments)
                    .innerJoin(user, eq(shelterAssessments.createdByUserId, user.id))
                    .where(
                        cursor
                            ? or(
                                  lt(shelterAssessments.createdAt, cursor.createdAt),
                                  and(
                                      eq(shelterAssessments.createdAt, cursor.createdAt),
                                      lt(shelterAssessments.id, cursor.id),
                                  ),
                              )
                            : undefined,
                    )
                    .orderBy(desc(shelterAssessments.createdAt), desc(shelterAssessments.id))
                    .limit(batchSize)

                if (!records.length) return
                const assessmentIds = records.map((record) => record.id)
                const [responses, photoCounts] = await Promise.all([
                    database
                        .select({
                            assessmentId: assessmentResponses.assessmentId,
                            criterionKey: assessmentResponses.criterionKey,
                            answer: assessmentResponses.answer,
                            comments: assessmentResponses.comments,
                            quantities: assessmentResponses.quantities,
                        })
                        .from(assessmentResponses)
                        .where(inArray(assessmentResponses.assessmentId, assessmentIds))
                        .orderBy(
                            asc(assessmentResponses.assessmentId),
                            asc(assessmentResponses.criterionKey),
                        ),
                    database
                        .select({
                            assessmentId: assessmentPhotos.assessmentId,
                            photoCount: count(assessmentPhotos.id),
                        })
                        .from(assessmentPhotos)
                        .where(inArray(assessmentPhotos.assessmentId, assessmentIds))
                        .groupBy(assessmentPhotos.assessmentId),
                ])
                const responsesByAssessment = new Map<string, typeof responses>()
                for (const response of responses) {
                    const grouped = responsesByAssessment.get(response.assessmentId) ?? []
                    grouped.push(response)
                    responsesByAssessment.set(response.assessmentId, grouped)
                }
                const photoCountByAssessment = new Map(
                    photoCounts.map((record) => [record.assessmentId, record.photoCount]),
                )
                for (const record of records) {
                    yield {
                        id: record.id,
                        formVersion: record.formVersion,
                        institution: record.institution,
                        visitDate: record.visitDate,
                        municipality: record.municipality,
                        department: record.department,
                        contactName: record.contactName,
                        contactRole: record.contactRole,
                        phone: record.phone,
                        email: record.email,
                        protectionRiskDetails: record.protectionRiskDetails,
                        generalObservations: record.generalObservations,
                        visitors: record.visitors,
                        createdAt: record.createdAt,
                        createdBy: `${record.creatorName} <${record.creatorEmail}>`,
                        responses: (responsesByAssessment.get(record.id) ?? []).map((response) => ({
                            criterionKey: response.criterionKey,
                            answer: response.answer,
                            comments: response.comments,
                            quantities: response.quantities,
                        })),
                        photoCount: photoCountByAssessment.get(record.id) ?? 0,
                    }
                }
                const last = records.at(-1)
                if (!last || records.length < batchSize) return
                cursor = { createdAt: last.createdAt, id: last.id }
            }
        },
        async findDetailed(id) {
            const [record] = await database
                .select({
                    id: shelterAssessments.id,
                    formVersion: shelterAssessments.formVersion,
                    institution: shelterAssessments.institution,
                    visitDate: shelterAssessments.visitDate,
                    municipality: shelterAssessments.municipality,
                    department: shelterAssessments.department,
                    contactName: shelterAssessments.contactName,
                    contactRole: shelterAssessments.contactRole,
                    phone: shelterAssessments.phone,
                    email: shelterAssessments.email,
                    protectionRiskDetails: shelterAssessments.protectionRiskDetails,
                    generalObservations: shelterAssessments.generalObservations,
                    visitors: shelterAssessments.visitors,
                    createdAt: shelterAssessments.createdAt,
                    creatorName: user.name,
                    creatorEmail: user.email,
                })
                .from(shelterAssessments)
                .innerJoin(user, eq(shelterAssessments.createdByUserId, user.id))
                .where(eq(shelterAssessments.id, id))
            if (!record) return null

            const [responses, photos] = await Promise.all([
                database
                    .select({
                        criterionKey: assessmentResponses.criterionKey,
                        answer: assessmentResponses.answer,
                        comments: assessmentResponses.comments,
                        quantities: assessmentResponses.quantities,
                    })
                    .from(assessmentResponses)
                    .where(eq(assessmentResponses.assessmentId, id))
                    .orderBy(asc(assessmentResponses.criterionKey)),
                database
                    .select({
                        position: assessmentPhotos.position,
                        mimeType: assessmentPhotos.mimeType,
                        data: assessmentPhotos.data,
                    })
                    .from(assessmentPhotos)
                    .where(eq(assessmentPhotos.assessmentId, id))
                    .orderBy(asc(assessmentPhotos.position)),
            ])
            const { creatorName, creatorEmail, ...metadata } = record
            return {
                ...metadata,
                createdBy: `${creatorName} <${creatorEmail}>`,
                responses,
                photos,
            }
        },
    }
}

export const drizzleAdminAssessmentRepository = createDrizzleAdminAssessmentRepository()

const internalUserAuth = createAuth(databasePool, serverConfig, { allowPublicSignUp: true })

export const drizzleAdminUserService: AdminUserService = {
    async list() {
        const users = await db
            .select({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            })
            .from(user)
            .orderBy(desc(user.createdAt))

        return users.map((record) => ({
            ...record,
            createdAt: record.createdAt.toISOString(),
        }))
    },
    async create(input) {
        const result = await internalUserAuth.api.signUpEmail({ body: input })
        return {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            role: 'evaluator',
            createdAt: result.user.createdAt.toISOString(),
        }
    },
    async updatePassword(userId, password) {
        const [existingUser] = await db
            .select({ id: user.id })
            .from(user)
            .where(eq(user.id, userId))
        if (!existingUser) throw new AdminUserNotFoundError('User not found')

        const passwordHash = await hashPassword(password)
        const [credentialAccount] = await db
            .select({ id: account.id })
            .from(account)
            .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))

        await db.transaction(async (transaction) => {
            if (credentialAccount) {
                await transaction
                    .update(account)
                    .set({ password: passwordHash, updatedAt: new Date() })
                    .where(eq(account.id, credentialAccount.id))
            } else {
                await transaction.insert(account).values({
                    id: randomUUID(),
                    accountId: userId,
                    providerId: 'credential',
                    userId,
                    password: passwordHash,
                })
            }
            await transaction.delete(session).where(eq(session.userId, userId))
        })
    },
    async promote(userId) {
        const [promoted] = await db
            .update(user)
            .set({ role: 'super_admin', updatedAt: new Date() })
            .where(eq(user.id, userId))
            .returning({
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                createdAt: user.createdAt,
            })
        if (!promoted) throw new AdminUserNotFoundError('User not found')
        return { ...promoted, createdAt: promoted.createdAt.toISOString() }
    },
}

function parseNewUser(input: unknown) {
    const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
    const name = typeof value.name === 'string' ? value.name.trim().replace(/\s+/g, ' ') : ''
    const email = typeof value.email === 'string' ? value.email.trim().toLowerCase() : ''
    const password = typeof value.password === 'string' ? value.password : ''
    const errors: string[] = []

    if (!name) errors.push('name is required')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email is invalid')
    if (password.length < 8) errors.push('password must be at least 8 characters')
    if (password.length > 128) errors.push('password must be at most 128 characters')

    return errors.length
        ? { success: false as const, errors }
        : { success: true as const, data: { name, email, password } }
}

function parsePassword(input: unknown) {
    const value = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
    const password = typeof value.password === 'string' ? value.password : ''
    return password.length >= 8 && password.length <= 128 ? password : null
}

function userError(response: Response, error: unknown) {
    if (error instanceof AdminUserNotFoundError) {
        response.status(404).json({ error: 'User not found' })
        return
    }
    const code =
        error && typeof error === 'object' && 'body' in error
            ? String((error as { body?: { code?: string } }).body?.code ?? '')
            : ''
    if (code.includes('USER_ALREADY_EXISTS')) {
        response.status(409).json({ error: 'A user with this email already exists' })
        return
    }
    console.error('Unable to manage user', error)
    response.status(500).json({ error: 'Unable to manage user' })
}

function csvDownloadFilename(): string {
    return `evaluaciones-albergues-${new Date().toISOString().slice(0, 10)}.csv`
}

function setCsvHeaders(response: Response): void {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8')
    response.setHeader('Content-Disposition', `attachment; filename="${csvDownloadFilename()}"`)
    response.setHeader('Cache-Control', 'private, no-store')
}

async function writeWithBackpressure(response: Response, chunk: string): Promise<void> {
    if (response.destroyed || response.writableEnded) throw new Error('Response closed')
    if (response.write(chunk)) return
    await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
            response.removeListener('drain', onDrain)
            response.removeListener('close', onClose)
        }
        const onDrain = () => {
            cleanup()
            resolve()
        }
        const onClose = () => {
            cleanup()
            reject(new Error('Response closed'))
        }
        response.once('drain', onDrain)
        response.once('close', onClose)
    })
}

export async function streamAssessmentCsv(
    response: Response,
    records: AsyncIterable<AssessmentCsvRecord>,
): Promise<void> {
    const iterator = records[Symbol.asyncIterator]()
    try {
        const first = await iterator.next()
        setCsvHeaders(response)
        await writeWithBackpressure(response, createAssessmentCsvHeader())
        if (!first.done) {
            await writeWithBackpressure(response, createAssessmentCsvChunk(first.value))
            while (true) {
                const next = await iterator.next()
                if (next.done) break
                await writeWithBackpressure(response, createAssessmentCsvChunk(next.value))
            }
        }
        response.end()
    } catch (error) {
        await iterator.return?.()
        throw error
    }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu

export function createAdminRouter({
    sessionResolver = betterAuthAdminSessionResolver,
    assessmentRepository = drizzleAdminAssessmentRepository,
    userService = drizzleAdminUserService,
    pdfGenerator = createAssessmentPdf,
}: {
    sessionResolver?: AdminSessionResolver
    assessmentRepository?: AdminAssessmentRepository
    userService?: AdminUserService
    pdfGenerator?: (record: AssessmentPdfRecord) => Promise<Uint8Array>
} = {}) {
    const router = Router()

    router.use(async (request, response, next) => {
        const session = await sessionResolver(request.headers)
        if (!session) {
            response.status(401).json({ error: 'Authentication required' })
            return
        }
        if (session.user.role !== 'super_admin') {
            response.status(403).json({ error: 'Super admin access required' })
            return
        }
        next()
    })

    router.head('/assessments.csv', (_request, response) => {
        setCsvHeaders(response)
        response.status(200).end()
    })

    router.get('/assessments.csv', async (_request, response) => {
        try {
            await streamAssessmentCsv(response, assessmentRepository.streamCsvBatches())
        } catch (error) {
            console.error('Unable to export shelter assessments', error)
            if (response.headersSent) {
                response.destroy(error instanceof Error ? error : undefined)
                return
            }
            response.status(500).json({ error: 'Unable to export assessments' })
        }
    })

    router.get('/assessments/:assessmentId.pdf', async (request, response) => {
        const assessmentId = request.params.assessmentId
        if (!UUID_PATTERN.test(assessmentId)) {
            response.status(400).json({ error: 'Invalid assessment ID' })
            return
        }
        try {
            const record = await assessmentRepository.findDetailed(assessmentId)
            if (!record) {
                response.status(404).json({ error: 'Assessment not found' })
                return
            }
            const pdf = await pdfGenerator(record)
            response.setHeader('Content-Type', 'application/pdf')
            response.setHeader(
                'Content-Disposition',
                `attachment; filename="evaluacion-${assessmentId}.pdf"`,
            )
            response.setHeader('Cache-Control', 'private, no-store')
            response.send(Buffer.from(pdf))
        } catch (error) {
            console.error('Unable to export shelter assessment', error)
            if (response.headersSent) {
                response.destroy(error instanceof Error ? error : undefined)
                return
            }
            response.status(500).json({ error: 'Unable to export assessment' })
        }
    })

    router.get('/assessments', async (_request, response) => {
        try {
            response.json({ records: await assessmentRepository.list() })
        } catch (error) {
            console.error('Unable to list shelter assessments', error)
            response.status(500).json({ error: 'Unable to load assessments' })
        }
    })

    router.get('/users', async (_request, response) => {
        try {
            response.json({ users: await userService.list() })
        } catch (error) {
            userError(response, error)
        }
    })

    router.post('/users', async (request, response) => {
        const parsed = parseNewUser(request.body)
        if (!parsed.success) {
            response.status(400).json({ error: 'Invalid user details', details: parsed.errors })
            return
        }
        try {
            response.status(201).json({ user: await userService.create(parsed.data) })
        } catch (error) {
            userError(response, error)
        }
    })

    router.patch('/users/:userId/password', async (request, response) => {
        const password = parsePassword(request.body)
        if (!password) {
            response.status(400).json({ error: 'Password must be between 8 and 128 characters' })
            return
        }
        try {
            await userService.updatePassword(request.params.userId, password)
            response.json({ success: true })
        } catch (error) {
            userError(response, error)
        }
    })

    router.patch('/users/:userId/role', async (request, response) => {
        if (request.body?.role !== 'super_admin') {
            response.status(400).json({ error: 'Only promotion to super admin is supported' })
            return
        }
        try {
            response.json({ user: await userService.promote(request.params.userId) })
        } catch (error) {
            userError(response, error)
        }
    })

    return router
}
