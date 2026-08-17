import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import { hashPassword } from 'better-auth/crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { and, asc, count, desc, eq, inArray, lt, or, sql } from 'drizzle-orm'
import { json, type NextFunction, type Request, type Response, Router } from 'express'
import {
    ASSESSMENT_CRITERIA,
    type AssessmentSubmission,
    parseAssessmentSubmission,
} from '../shared/assessment.js'
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

export const CURRENT_ASSESSMENT_FORM_VERSION = '2026-08-10'

export type EditableAssessmentPhoto = {
    position: number
    mimeType: 'image/jpeg'
    size: number
    data: Buffer
}

export type EditableAssessmentRecord = {
    id: string
    formVersion: typeof CURRENT_ASSESSMENT_FORM_VERSION
    revision: string
    createdAt: string
    createdBy: { name: string; email: string }
    assessment: Omit<AssessmentSubmission, 'photos'> & { photos: [] }
    photos: EditableAssessmentPhoto[]
}

export type FindEditableAssessmentResult =
    | { status: 'found'; record: EditableAssessmentRecord }
    | { status: 'unsupported' }
    | { status: 'not_found' }

export type UpdateEditableAssessmentInput = {
    id: string
    revision: string
    formVersion: string
    assessment: AssessmentSubmission
}

export type UpdateEditableAssessmentResult =
    | { status: 'updated'; revision: string }
    | { status: 'unsupported' }
    | { status: 'conflict' }
    | { status: 'not_found' }

export type AdminAssessmentRepository = {
    list(): Promise<AdminAssessment[]>
    streamCsvBatches(): AsyncIterable<AssessmentCsvRecord>
    findDetailed(id: string): Promise<AssessmentPdfRecord | null>
    findEditable(id: string): Promise<FindEditableAssessmentResult>
    update(input: UpdateEditableAssessmentInput): Promise<UpdateEditableAssessmentResult>
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
            let cursor: { createdAt: string; id: string } | undefined
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
                        createdAtCursor: sql<string>`${shelterAssessments.createdAt}::text`,
                        creatorName: user.name,
                        creatorEmail: user.email,
                    })
                    .from(shelterAssessments)
                    .innerJoin(user, eq(shelterAssessments.createdByUserId, user.id))
                    .where(
                        cursor
                            ? or(
                                  lt(
                                      shelterAssessments.createdAt,
                                      sql<Date>`${cursor.createdAt}::timestamptz`,
                                  ),
                                  and(
                                      eq(
                                          shelterAssessments.createdAt,
                                          sql<Date>`${cursor.createdAt}::timestamptz`,
                                      ),
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
                const last = records[records.length - 1]
                if (!last || records.length < batchSize) return
                cursor = { createdAt: last.createdAtCursor, id: last.id }
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
        async findEditable(id) {
            return database.transaction(async (transaction) => {
                const [parent] = await transaction
                    .select({
                        id: shelterAssessments.id,
                        formVersion: shelterAssessments.formVersion,
                    })
                    .from(shelterAssessments)
                    .where(eq(shelterAssessments.id, id))
                    .for('share')

                if (!parent) return { status: 'not_found' }
                if (parent.formVersion !== CURRENT_ASSESSMENT_FORM_VERSION) {
                    return { status: 'unsupported' }
                }

                const criterionKeys = ASSESSMENT_CRITERIA.map((criterion) => criterion.key)
                const records = await transaction
                    .select({
                        id: shelterAssessments.id,
                        revision: sql<string>`${shelterAssessments.updatedAt}::text`,
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
                        and(
                            eq(shelterAssessments.id, id),
                            eq(shelterAssessments.formVersion, CURRENT_ASSESSMENT_FORM_VERSION),
                        ),
                    )
                const storedResponses = await transaction
                    .select({
                        criterionKey: assessmentResponses.criterionKey,
                        answer: assessmentResponses.answer,
                        comments: assessmentResponses.comments,
                        quantities: assessmentResponses.quantities,
                    })
                    .from(assessmentResponses)
                    .where(
                        and(
                            eq(assessmentResponses.assessmentId, id),
                            inArray(assessmentResponses.criterionKey, criterionKeys),
                        ),
                    )
                const photos = await transaction
                    .select({
                        position: assessmentPhotos.position,
                        mimeType: assessmentPhotos.mimeType,
                        size: assessmentPhotos.size,
                        data: assessmentPhotos.data,
                    })
                    .from(assessmentPhotos)
                    .where(eq(assessmentPhotos.assessmentId, id))
                    .orderBy(asc(assessmentPhotos.position))
                const [record] = records
                if (!record) return { status: 'not_found' }
                const responseByKey = new Map(
                    storedResponses.map((response) => [response.criterionKey, response]),
                )

                return {
                    status: 'found',
                    record: {
                        id: record.id,
                        formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                        revision: record.revision,
                        createdAt: record.createdAt.toISOString(),
                        createdBy: { name: record.creatorName, email: record.creatorEmail },
                        assessment: {
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
                            photos: [],
                            responses: criterionKeys
                                .map((criterionKey) => responseByKey.get(criterionKey))
                                .filter((response): response is NonNullable<typeof response> =>
                                    Boolean(response),
                                ),
                        },
                        photos: photos.map((photo) => ({
                            ...photo,
                            mimeType: 'image/jpeg' as const,
                            data: Buffer.from(photo.data),
                        })),
                    },
                }
            })
        },
        async update(input) {
            return database.transaction(async (transaction) => {
                if (input.formVersion !== CURRENT_ASSESSMENT_FORM_VERSION) {
                    return { status: 'unsupported' as const }
                }

                const [updated] = await transaction
                    .update(shelterAssessments)
                    .set({
                        institution: input.assessment.institution,
                        visitDate: input.assessment.visitDate,
                        municipality: input.assessment.municipality,
                        department: input.assessment.department,
                        contactName: input.assessment.contactName,
                        contactRole: input.assessment.contactRole,
                        phone: input.assessment.phone,
                        email: input.assessment.email,
                        protectionRiskDetails: input.assessment.protectionRiskDetails,
                        generalObservations: input.assessment.generalObservations,
                        visitors: input.assessment.visitors,
                        updatedAt: sql`greatest(clock_timestamp(), ${shelterAssessments.updatedAt} + interval '1 microsecond')`,
                    })
                    .where(
                        and(
                            eq(shelterAssessments.id, input.id),
                            eq(shelterAssessments.formVersion, CURRENT_ASSESSMENT_FORM_VERSION),
                            sql`${shelterAssessments.updatedAt}::text = ${input.revision}`,
                        ),
                    )
                    .returning({
                        revision: sql<string>`${shelterAssessments.updatedAt}::text`,
                    })

                if (!updated) {
                    const [existing] = await transaction
                        .select({ formVersion: shelterAssessments.formVersion })
                        .from(shelterAssessments)
                        .where(eq(shelterAssessments.id, input.id))
                    if (!existing) return { status: 'not_found' as const }
                    if (existing.formVersion !== CURRENT_ASSESSMENT_FORM_VERSION) {
                        return { status: 'unsupported' as const }
                    }
                    return { status: 'conflict' as const }
                }

                const criterionKeys = ASSESSMENT_CRITERIA.map((criterion) => criterion.key)
                await transaction
                    .delete(assessmentResponses)
                    .where(
                        and(
                            eq(assessmentResponses.assessmentId, input.id),
                            inArray(assessmentResponses.criterionKey, criterionKeys),
                        ),
                    )
                await transaction.insert(assessmentResponses).values(
                    input.assessment.responses.map((response) => ({
                        assessmentId: input.id,
                        criterionKey: response.criterionKey,
                        answer: response.answer,
                        comments: response.comments,
                        quantities: response.quantities,
                    })),
                )
                await transaction
                    .delete(assessmentPhotos)
                    .where(eq(assessmentPhotos.assessmentId, input.id))
                if (input.assessment.photos.length) {
                    await transaction.insert(assessmentPhotos).values(
                        input.assessment.photos.map((photo, position) => ({
                            assessmentId: input.id,
                            position,
                            mimeType: photo.mimeType,
                            size: photo.size,
                            data: Buffer.from(photo.data, 'base64'),
                        })),
                    )
                }

                return { status: 'updated' as const, revision: updated.revision }
            })
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
    ensureResponseOpen(response)
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

function ensureResponseOpen(response: Response): void {
    if (response.destroyed || response.writableEnded) throw new Error('Response closed')
}

export async function streamAssessmentCsv(
    response: Response,
    records: AsyncIterable<AssessmentCsvRecord>,
): Promise<void> {
    const iterator = records[Symbol.asyncIterator]()
    try {
        const first = await iterator.next()
        ensureResponseOpen(response)
        setCsvHeaders(response)
        await writeWithBackpressure(response, createAssessmentCsvHeader())
        if (!first.done) {
            await writeWithBackpressure(response, createAssessmentCsvChunk(first.value))
            while (true) {
                const next = await iterator.next()
                ensureResponseOpen(response)
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
const REVISION_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?[+-]\d{2}(?::?\d{2})?$/u

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function setPrivateNoStore(response: Response): void {
    response.setHeader('Cache-Control', 'private, no-store')
}

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

    router.get('/assessments/:assessmentId', async (request, response) => {
        const assessmentId = request.params.assessmentId
        setPrivateNoStore(response)
        if (!UUID_PATTERN.test(assessmentId)) {
            response.status(400).json({ error: 'El identificador de la evaluación no es válido' })
            return
        }
        try {
            const result = await assessmentRepository.findEditable(assessmentId)
            if (result.status === 'not_found') {
                response.status(404).json({ error: 'No se encontró la evaluación' })
                return
            }
            if (result.status === 'unsupported') {
                response.status(409).json({
                    error: 'Esta versión histórica del formulario no se puede editar',
                })
                return
            }
            const { record } = result
            response.json({
                record: {
                    id: record.id,
                    formVersion: record.formVersion,
                    revision: record.revision,
                    createdAt: record.createdAt,
                    createdBy: {
                        name: record.createdBy.name,
                        email: record.createdBy.email,
                    },
                    assessment: {
                        institution: record.assessment.institution,
                        visitDate: record.assessment.visitDate,
                        municipality: record.assessment.municipality,
                        department: record.assessment.department,
                        contactName: record.assessment.contactName,
                        contactRole: record.assessment.contactRole,
                        phone: record.assessment.phone,
                        email: record.assessment.email,
                        protectionRiskDetails: record.assessment.protectionRiskDetails,
                        generalObservations: record.assessment.generalObservations,
                        visitors: record.assessment.visitors,
                        responses: record.assessment.responses.map((storedResponse) => ({
                            criterionKey: storedResponse.criterionKey,
                            answer: storedResponse.answer,
                            comments: storedResponse.comments,
                            quantities: storedResponse.quantities,
                        })),
                        photos: record.photos.map((photo) => ({
                            position: photo.position,
                            mimeType: photo.mimeType,
                            size: photo.size,
                            data: photo.data.toString('base64'),
                        })),
                    },
                },
            })
        } catch (error) {
            console.error('Unable to load editable shelter assessment', error)
            response.status(500).json({ error: 'No fue posible cargar la evaluación' })
        }
    })

    router.put('/assessments/:assessmentId', json({ limit: '4mb' }), async (request, response) => {
        const assessmentId = request.params.assessmentId
        setPrivateNoStore(response)
        if (!UUID_PATTERN.test(assessmentId)) {
            response.status(400).json({ error: 'El identificador de la evaluación no es válido' })
            return
        }
        if (!isObject(request.body)) {
            response.status(400).json({ error: 'Los datos de edición no son válidos' })
            return
        }
        const revision = request.body.revision
        const formVersion = request.body.formVersion
        if (
            typeof revision !== 'string' ||
            revision.length > 64 ||
            !REVISION_PATTERN.test(revision)
        ) {
            response.status(400).json({ error: 'La revisión de la evaluación no es válida' })
            return
        }
        if (formVersion !== CURRENT_ASSESSMENT_FORM_VERSION) {
            response.status(400).json({ error: 'La versión del formulario no es válida' })
            return
        }
        const parsed = parseAssessmentSubmission(request.body.assessment)
        if (!parsed.success) {
            response.status(400).json({
                error: 'La evaluación no es válida',
                details: 'errors' in parsed ? parsed.errors : [],
            })
            return
        }

        try {
            const result = await assessmentRepository.update({
                id: assessmentId,
                revision,
                formVersion,
                assessment: parsed.data,
            })
            if (result.status === 'not_found') {
                response.status(404).json({ error: 'No se encontró la evaluación' })
                return
            }
            if (result.status === 'unsupported') {
                response.status(409).json({
                    error: 'Esta versión histórica del formulario no se puede editar',
                })
                return
            }
            if (result.status === 'conflict') {
                response.status(409).json({
                    error: 'La evaluación fue modificada por otra persona. Recárguela.',
                })
                return
            }
            response.json({ id: assessmentId, revision: result.revision })
        } catch (error) {
            console.error('Unable to update shelter assessment', error)
            response.status(500).json({ error: 'No fue posible actualizar la evaluación' })
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

    router.use(json())

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

    router.use(
        (
            error: { status?: number; type?: string },
            _request: Request,
            response: Response,
            next: NextFunction,
        ) => {
            if (error.status === 413 || error.type === 'entity.too.large') {
                response
                    .status(413)
                    .json({ error: 'El contenido de la evaluación es demasiado grande' })
                return
            }
            if (error.type === 'entity.parse.failed') {
                response.status(400).json({ error: 'El contenido JSON no es válido' })
                return
            }
            next(error)
        },
    )

    return router
}
