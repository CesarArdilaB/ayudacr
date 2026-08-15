import { randomUUID } from 'node:crypto'
import type { IncomingHttpHeaders } from 'node:http'
import { hashPassword } from 'better-auth/crypto'
import { fromNodeHeaders } from 'better-auth/node'
import { and, count, desc, eq } from 'drizzle-orm'
import { type Response, Router } from 'express'
import { auth, createAuth, databasePool, serverConfig } from './auth.js'
import { db } from './db/index.js'
import { account, assessmentResponses, session, shelterAssessments, user } from './db/schema.js'

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

export const drizzleAdminAssessmentRepository: AdminAssessmentRepository = {
    async list() {
        const records = await db
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
}

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

export function createAdminRouter({
    sessionResolver = betterAuthAdminSessionResolver,
    assessmentRepository = drizzleAdminAssessmentRepository,
    userService = drizzleAdminUserService,
}: {
    sessionResolver?: AdminSessionResolver
    assessmentRepository?: AdminAssessmentRepository
    userService?: AdminUserService
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
