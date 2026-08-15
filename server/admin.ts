import type { IncomingHttpHeaders } from 'node:http'
import { fromNodeHeaders } from 'better-auth/node'
import { count, desc, eq } from 'drizzle-orm'
import { Router } from 'express'
import { auth } from './auth.js'
import { db } from './db/index.js'
import { assessmentResponses, shelterAssessments, user } from './db/schema.js'

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

export function createAdminRouter({
    sessionResolver = betterAuthAdminSessionResolver,
    assessmentRepository = drizzleAdminAssessmentRepository,
}: {
    sessionResolver?: AdminSessionResolver
    assessmentRepository?: AdminAssessmentRepository
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

    return router
}
