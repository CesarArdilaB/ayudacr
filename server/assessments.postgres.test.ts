// @vitest-environment node

import { PGlite } from '@electric-sql/pglite'
import { count, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ASSESSMENT_CRITERIA, type AssessmentSubmission } from '../shared/assessment.js'
import { createDrizzleAssessmentRepository } from './assessments.js'
import * as schema from './db/schema.js'

function submission(institution: string, photoSize = 6): AssessmentSubmission {
    return {
        institution,
        visitDate: '2026-08-16',
        municipality: 'CALI',
        department: 'VALLE DEL CAUCA',
        contactName: 'Prueba PostgreSQL',
        contactRole: '',
        phone: '',
        email: '',
        protectionRiskDetails: '',
        generalObservations: '',
        visitors: [],
        photos: [
            {
                data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xd9]).toString('base64'),
                mimeType: 'image/jpeg',
                size: photoSize,
            },
        ],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes',
            comments: '',
            quantities: {},
        })),
    }
}

describe('drizzle assessment repository with PostgreSQL', () => {
    let client: PGlite
    let database: ReturnType<typeof drizzle<typeof schema>>

    beforeEach(async () => {
        client = new PGlite()
        database = drizzle(client, { schema })
        await migrate(database, { migrationsFolder: 'drizzle' })
        await database.insert(schema.user).values({
            id: 'integration-user',
            name: 'Integration User',
            email: 'integration@example.com',
        })
    })

    afterEach(async () => {
        await client.close()
    })

    it('commits assessment, responses and photos, then cascades deletion', async () => {
        const repository = createDrizzleAssessmentRepository(
            database as unknown as Parameters<typeof createDrizzleAssessmentRepository>[0],
        )

        const created = await repository.create(submission('Atomic success'), 'integration-user')

        expect(
            await database
                .select({ value: count() })
                .from(schema.assessmentResponses)
                .where(eq(schema.assessmentResponses.assessmentId, created.id)),
        ).toEqual([{ value: 44 }])
        expect(
            await database
                .select({ value: count() })
                .from(schema.assessmentPhotos)
                .where(eq(schema.assessmentPhotos.assessmentId, created.id)),
        ).toEqual([{ value: 1 }])

        await database
            .delete(schema.shelterAssessments)
            .where(eq(schema.shelterAssessments.id, created.id))

        expect(
            await database
                .select({ value: count() })
                .from(schema.assessmentPhotos)
                .where(eq(schema.assessmentPhotos.assessmentId, created.id)),
        ).toEqual([{ value: 0 }])
    })

    it('rolls back the assessment and responses when a photo violates a constraint', async () => {
        const repository = createDrizzleAssessmentRepository(
            database as unknown as Parameters<typeof createDrizzleAssessmentRepository>[0],
        )

        await expect(
            repository.create(submission('Atomic rollback', 1), 'integration-user'),
        ).rejects.toThrow()

        expect(
            await database
                .select({ value: count() })
                .from(schema.shelterAssessments)
                .where(eq(schema.shelterAssessments.institution, 'Atomic rollback')),
        ).toEqual([{ value: 0 }])
        expect(await database.select({ value: count() }).from(schema.assessmentResponses)).toEqual([
            { value: 0 },
        ])
    })
})
