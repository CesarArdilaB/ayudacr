import type { IncomingHttpHeaders } from 'node:http'
import { fromNodeHeaders } from 'better-auth/node'
import { Router } from 'express'
import type { AssessmentSubmission } from '../shared/assessment.js'
import { parseAssessmentSubmission } from '../shared/assessment.js'
import { auth } from './auth.js'
import { db } from './db/index.js'
import { assessmentPhotos, assessmentResponses, shelterAssessments } from './db/schema.js'

export type AssessmentSession = { user: { id: string } } | null
export type SessionResolver = (headers: IncomingHttpHeaders) => Promise<AssessmentSession>

export type AssessmentRepository = {
    create(submission: AssessmentSubmission, userId: string): Promise<{ id: string }>
}

export function createDrizzleAssessmentRepository(
    database: Pick<typeof db, 'transaction'> = db,
): AssessmentRepository {
    return {
        async create(submission, userId) {
            return database.transaction(async (transaction) => {
                const [assessment] = await transaction
                    .insert(shelterAssessments)
                    .values({
                        institution: submission.institution,
                        visitDate: submission.visitDate,
                        municipality: submission.municipality,
                        department: submission.department,
                        contactName: submission.contactName,
                        contactRole: submission.contactRole,
                        phone: submission.phone,
                        email: submission.email,
                        protectionRiskDetails: submission.protectionRiskDetails,
                        generalObservations: submission.generalObservations,
                        visitors: submission.visitors,
                        createdByUserId: userId,
                    })
                    .returning({ id: shelterAssessments.id })

                if (!assessment) {
                    throw new Error('Assessment insert did not return an ID')
                }

                await transaction.insert(assessmentResponses).values(
                    submission.responses.map((response) => ({
                        assessmentId: assessment.id,
                        criterionKey: response.criterionKey,
                        answer: response.answer,
                        comments: response.comments,
                        quantities: response.quantities,
                    })),
                )

                if (submission.photos.length > 0) {
                    await transaction.insert(assessmentPhotos).values(
                        submission.photos.map((photo, position) => ({
                            assessmentId: assessment.id,
                            position,
                            mimeType: photo.mimeType,
                            size: photo.size,
                            data: Buffer.from(photo.data, 'base64'),
                        })),
                    )
                }

                return assessment
            })
        },
    }
}

export const drizzleAssessmentRepository = createDrizzleAssessmentRepository()

const betterAuthSessionResolver: SessionResolver = async (headers) => {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(headers) })
    return session ? { user: { id: session.user.id } } : null
}

export function createAssessmentsRouter({
    sessionResolver = betterAuthSessionResolver,
    repository = drizzleAssessmentRepository,
}: {
    sessionResolver?: SessionResolver
    repository?: AssessmentRepository
} = {}) {
    const router = Router()

    router.post('/', async (request, response) => {
        try {
            const session = await sessionResolver(request.headers)
            if (!session) {
                response.status(401).json({ error: 'Authentication required' })
                return
            }

            const parsed = parseAssessmentSubmission(request.body)
            if (parsed.success === false) {
                response.status(400).json({
                    error: 'Assessment validation failed',
                    details: parsed.errors,
                })
                return
            }

            const assessment = await repository.create(parsed.data, session.user.id)
            response.status(201).json(assessment)
        } catch (error) {
            console.error('Unable to create shelter assessment', error)
            response.status(500).json({ error: 'Unable to save the assessment' })
        }
    })

    return router
}
