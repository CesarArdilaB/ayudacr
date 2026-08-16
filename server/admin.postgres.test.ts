// @vitest-environment node

import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createDrizzleAdminAssessmentRepository } from './admin.js'
import * as schema from './db/schema.js'

describe('admin assessment export repository with PostgreSQL', () => {
    let client: PGlite
    let database: ReturnType<typeof drizzle<typeof schema>>

    beforeEach(async () => {
        client = new PGlite()
        database = drizzle(client, { schema })
        await migrate(database, { migrationsFolder: 'drizzle' })
        await database.insert(schema.user).values({
            id: 'export-user',
            name: 'Export User',
            email: 'export@example.com',
        })
    })

    afterEach(async () => {
        await client.close()
    })

    it('paginates equal timestamps by descending UUID without skips or duplicates', async () => {
        const createdAt = new Date('2026-08-16T12:00:00.000Z')
        const ids = Array.from(
            { length: 205 },
            (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        )
        await database.insert(schema.shelterAssessments).values(
            ids.map((id, index) => ({
                id,
                institution: `Albergue ${index}`,
                visitDate: '2026-08-16',
                municipality: 'CALI',
                department: 'VALLE DEL CAUCA',
                contactName: 'Contacto',
                createdByUserId: 'export-user',
                createdAt,
            })),
        )
        const repository = createDrizzleAdminAssessmentRepository(
            database as unknown as Parameters<typeof createDrizzleAdminAssessmentRepository>[0],
        )

        const exported = []
        for await (const record of repository.streamCsvBatches()) exported.push(record)

        expect(exported.map((record) => record.id)).toEqual([...ids].reverse())
        expect(new Set(exported.map((record) => record.id)).size).toBe(ids.length)
    })

    it('groups responses and photo counts deterministically without exposing photo bytes in CSV', async () => {
        const id = '9f3c0dc7-c892-4a7f-8130-8df6f65a8547'
        await database.insert(schema.shelterAssessments).values({
            id,
            institution: 'Coliseo Central',
            visitDate: '2026-08-16',
            municipality: 'PEREIRA',
            department: 'RISARALDA',
            contactName: 'Contacto',
            createdByUserId: 'export-user',
        })
        await database.insert(schema.assessmentResponses).values([
            { assessmentId: id, criterionKey: 'z-last', answer: 'no' },
            { assessmentId: id, criterionKey: 'a-first', answer: 'yes' },
        ])
        await database.insert(schema.assessmentPhotos).values([
            {
                assessmentId: id,
                position: 1,
                mimeType: 'image/jpeg',
                size: 2,
                data: Buffer.from([4, 5]),
            },
            {
                assessmentId: id,
                position: 0,
                mimeType: 'image/jpeg',
                size: 3,
                data: Buffer.from([1, 2, 3]),
            },
        ])
        const repository = createDrizzleAdminAssessmentRepository(
            database as unknown as Parameters<typeof createDrizzleAdminAssessmentRepository>[0],
        )

        const records = []
        for await (const record of repository.streamCsvBatches()) records.push(record)

        expect(records).toHaveLength(1)
        expect(records[0].photoCount).toBe(2)
        expect(records[0].responses.map((response) => response.criterionKey)).toEqual([
            'a-first',
            'z-last',
        ])
        expect(records[0]).not.toHaveProperty('photos')
    })

    it('returns complete details with responses and photos in stable order', async () => {
        const id = '9f3c0dc7-c892-4a7f-8130-8df6f65a8547'
        await database.insert(schema.shelterAssessments).values({
            id,
            institution: 'Coliseo Central',
            visitDate: '2026-08-16',
            municipality: 'PEREIRA',
            department: 'RISARALDA',
            contactName: 'Contacto',
            createdByUserId: 'export-user',
        })
        await database.insert(schema.assessmentResponses).values([
            { assessmentId: id, criterionKey: 'z-last', answer: 'no' },
            { assessmentId: id, criterionKey: 'a-first', answer: 'yes' },
        ])
        await database.insert(schema.assessmentPhotos).values([
            {
                assessmentId: id,
                position: 1,
                mimeType: 'image/jpeg',
                size: 2,
                data: Buffer.from([4, 5]),
            },
            {
                assessmentId: id,
                position: 0,
                mimeType: 'image/jpeg',
                size: 3,
                data: Buffer.from([1, 2, 3]),
            },
        ])
        const repository = createDrizzleAdminAssessmentRepository(
            database as unknown as Parameters<typeof createDrizzleAdminAssessmentRepository>[0],
        )

        const record = await repository.findDetailed(id)

        expect(record?.createdBy).toBe('Export User <export@example.com>')
        expect(record?.responses.map((response) => response.criterionKey)).toEqual([
            'a-first',
            'z-last',
        ])
        expect(record?.photos.map((photo) => [photo.position, [...photo.data]])).toEqual([
            [0, [1, 2, 3]],
            [1, [4, 5]],
        ])
        expect(await repository.findDetailed('a07c72c1-e86e-4bca-94ac-ea8f67f95cb2')).toBeNull()
    })
})
