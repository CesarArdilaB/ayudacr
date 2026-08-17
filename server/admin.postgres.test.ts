// @vitest-environment node

import { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ASSESSMENT_CRITERIA, type AssessmentSubmission } from '../shared/assessment.js'
import { CURRENT_ASSESSMENT_FORM_VERSION, createDrizzleAdminAssessmentRepository } from './admin.js'
import * as schema from './db/schema.js'

function editableSubmission(overrides: Partial<AssessmentSubmission> = {}): AssessmentSubmission {
    return {
        institution: 'Coliseo Central',
        visitDate: '2026-08-16',
        municipality: 'PEREIRA',
        department: 'RISARALDA',
        contactName: 'Contacto inicial',
        contactRole: 'Coordinación',
        phone: '3001234567',
        email: 'contacto@example.com',
        protectionRiskDetails: 'Detalle inicial',
        generalObservations: 'Observación inicial',
        visitors: ['Ana Torres'],
        photos: [],
        responses: ASSESSMENT_CRITERIA.map((criterion) => ({
            criterionKey: criterion.key,
            answer: 'yes' as const,
            comments: `Comentario ${criterion.key}`,
            quantities: Object.fromEntries(
                (criterion.quantityFields ?? []).map((field) => [field.key, 1]),
            ),
        })),
        ...overrides,
    }
}

async function seedEditableAssessment(
    database: ReturnType<typeof drizzle<typeof schema>>,
    input: {
        id?: string
        formVersion?: string
        updatedAt?: Date
        unknownResponse?: boolean
        photos?: Buffer[]
    } = {},
) {
    const id = input.id ?? '9f3c0dc7-c892-4a7f-8130-8df6f65a8547'
    const submission = editableSubmission()
    const createdAt = new Date('2026-08-15T12:00:00.000Z')
    await database.insert(schema.shelterAssessments).values({
        id,
        formVersion: input.formVersion ?? CURRENT_ASSESSMENT_FORM_VERSION,
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
        createdByUserId: 'export-user',
        createdAt,
        updatedAt: input.updatedAt ?? createdAt,
    })
    await database.insert(schema.assessmentResponses).values([
        ...submission.responses.map((response) => ({ assessmentId: id, ...response })),
        ...(input.unknownResponse
            ? [
                  {
                      assessmentId: id,
                      criterionKey: 'future_private_criterion',
                      answer: 'no' as const,
                  },
              ]
            : []),
    ])
    if (input.photos?.length) {
        await database.insert(schema.assessmentPhotos).values(
            input.photos.map((data, position) => ({
                assessmentId: id,
                position,
                mimeType: 'image/jpeg',
                size: data.length,
                data,
            })),
        )
    }
    return { id, submission, createdAt }
}

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

    it('migrates the descending compound index used by the export cursor', async () => {
        const result = await client.query<{ indexdef: string }>(
            `SELECT indexdef FROM pg_indexes
             WHERE schemaname = 'public'
               AND indexname = 'shelter_assessments_created_at_id_idx'`,
        )

        expect(result.rows).toHaveLength(1)
        expect(result.rows[0].indexdef).toMatch(
            /\(created_at DESC NULLS LAST, id DESC NULLS LAST\)$/,
        )
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

    it('preserves PostgreSQL microseconds in the cursor within one JavaScript millisecond', async () => {
        const ids = Array.from(
            { length: 102 },
            (_, index) => `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`,
        )
        for (const [index, id] of ids.entries()) {
            const microseconds = String(index + 1).padStart(6, '0')
            await client.query(
                `INSERT INTO shelter_assessments
                    (id, institution, visit_date, municipality, department, contact_name,
                     created_by_user_id, created_at)
                 VALUES ($1, $2, '2026-08-16', 'CALI', 'VALLE DEL CAUCA', 'Contacto',
                         'export-user', $3)`,
                [id, `Microsegundo ${index + 1}`, `2026-08-16 12:00:00.${microseconds}+00`],
            )
        }
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

    describe('editable assessments', () => {
        it('loads only the current 44 fields and ordered photo buffers with an exact revision', async () => {
            const firstPhoto = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
            const secondPhoto = Buffer.from([0xff, 0xd8, 1, 0xff, 0xd9])
            const seeded = await seedEditableAssessment(database, {
                unknownResponse: true,
                photos: [firstPhoto, secondPhoto],
            })
            const repository = createDrizzleAdminAssessmentRepository(database as never)
            const exactRevision = await client.query<{ revision: string }>(
                'select updated_at::text as revision from shelter_assessments where id = $1',
                [seeded.id],
            )

            const result = await repository.findEditable(seeded.id)

            expect(result.status).toBe('found')
            if (result.status !== 'found') return
            expect(result.record).toMatchObject({
                id: seeded.id,
                formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                revision: exactRevision.rows[0]?.revision,
                createdAt: seeded.createdAt.toISOString(),
                createdBy: { name: 'Export User', email: 'export@example.com' },
            })
            expect(result.record.assessment).toMatchObject({
                institution: seeded.submission.institution,
                responses: expect.arrayContaining(seeded.submission.responses),
            })
            expect(result.record.assessment.responses).toHaveLength(44)
            expect(
                result.record.photos.map((photo) => [photo.position, photo.size, photo.data]),
            ).toEqual([
                [0, firstPhoto.length, firstPhoto],
                [1, secondPhoto.length, secondPhoto],
            ])
        })

        it('distinguishes missing and unsupported parents without reading sensitive children', async () => {
            const historical = await seedEditableAssessment(database, {
                formVersion: '2026-01-01',
            })
            await client.exec(
                'DROP TABLE assessment_photos; DROP TABLE assessment_responses; DROP TABLE "user" CASCADE;',
            )
            const repository = createDrizzleAdminAssessmentRepository(database as never)

            expect(await repository.findEditable(historical.id)).toEqual({ status: 'unsupported' })
            expect(await repository.findEditable('a07c72c1-e86e-4bca-94ac-ea8f67f95cb2')).toEqual({
                status: 'not_found',
            })
        })

        it('updates every editable field and child collection while preserving immutable data and unknown responses', async () => {
            const seeded = await seedEditableAssessment(database, {
                unknownResponse: true,
                photos: [Buffer.from([0xff, 0xd8, 0xff, 0xd9])],
            })
            const repository = createDrizzleAdminAssessmentRepository(database as never)
            const loaded = await repository.findEditable(seeded.id)
            if (loaded.status !== 'found') throw new Error('Expected editable fixture')
            const replacementPhoto = Buffer.from([0xff, 0xd8, 2, 0xff, 0xd9])
            const updatedSubmission = editableSubmission({
                institution: 'Institución actualizada',
                visitDate: '2026-08-17',
                municipality: 'CALI',
                department: 'VALLE DEL CAUCA',
                contactName: 'Nuevo contacto',
                contactRole: 'Nuevo cargo',
                phone: '3100000000',
                email: 'nuevo@example.com',
                protectionRiskDetails: 'Riesgos actualizados',
                generalObservations: 'Observaciones actualizadas',
                visitors: ['Una', 'Dos'],
                photos: [
                    {
                        mimeType: 'image/jpeg',
                        size: replacementPhoto.length,
                        data: replacementPhoto.toString('base64'),
                    },
                ],
                responses: editableSubmission().responses.map((response) => ({
                    ...response,
                    answer: 'no' as const,
                    comments: `Actualizado ${response.criterionKey}`,
                })),
            })

            const result = await repository.update({
                id: seeded.id,
                revision: loaded.record.revision,
                formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                assessment: updatedSubmission,
            })

            expect(result.status).toBe('updated')
            if (result.status !== 'updated') return
            expect(result.revision).not.toBe(loaded.record.revision)
            const reloaded = await repository.findEditable(seeded.id)
            expect(reloaded.status).toBe('found')
            if (reloaded.status !== 'found') return
            expect(reloaded.record.assessment).toMatchObject({
                ...updatedSubmission,
                photos: [],
            })
            expect(reloaded.record.photos.map((photo) => photo.data)).toEqual([replacementPhoto])
            expect(reloaded.record.createdAt).toBe(seeded.createdAt.toISOString())
            expect(reloaded.record.createdBy.email).toBe('export@example.com')
            expect(reloaded.record.formVersion).toBe(CURRENT_ASSESSMENT_FORM_VERSION)
            const unknown = await database
                .select()
                .from(schema.assessmentResponses)
                .where(eq(schema.assessmentResponses.criterionKey, 'future_private_criterion'))
            expect(unknown).toHaveLength(1)
        })

        it('advances the revision by at least one PostgreSQL microsecond and lets only one concurrent writer win', async () => {
            const seeded = await seedEditableAssessment(database)
            const repository = createDrizzleAdminAssessmentRepository(database as never)
            const loaded = await repository.findEditable(seeded.id)
            if (loaded.status !== 'found') throw new Error('Expected editable fixture')

            const [first, second] = await Promise.all([
                repository.update({
                    id: seeded.id,
                    revision: loaded.record.revision,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableSubmission({ institution: 'Primero' }),
                }),
                repository.update({
                    id: seeded.id,
                    revision: loaded.record.revision,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: editableSubmission({ institution: 'Segundo' }),
                }),
            ])

            expect([first.status, second.status].sort()).toEqual(['conflict', 'updated'])
            const winner = first.status === 'updated' ? first : second
            expect(winner.status).toBe('updated')
            if (winner.status === 'updated') {
                const comparison = await client.query<{ advanced: boolean }>(
                    'select updated_at > $2::timestamptz as advanced from shelter_assessments where id = $1',
                    [seeded.id, loaded.record.revision],
                )
                expect(comparison.rows[0]?.advanced).toBe(true)
            }
        })

        it('returns missing, unsupported, and conflict without mutating child records', async () => {
            const seeded = await seedEditableAssessment(database)
            const historical = await seedEditableAssessment(database, {
                id: 'b17c72c1-e86e-4bca-94ac-ea8f67f95cb2',
                formVersion: '2026-01-01',
            })
            const repository = createDrizzleAdminAssessmentRepository(database as never)
            const before = await database.select().from(schema.assessmentResponses)
            const assessment = editableSubmission({ institution: 'No debe persistir' })

            expect(
                await repository.update({
                    id: 'a07c72c1-e86e-4bca-94ac-ea8f67f95cb2',
                    revision: '2026-08-15 12:00:00+00',
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment,
                }),
            ).toEqual({ status: 'not_found' })
            expect(
                await repository.update({
                    id: seeded.id,
                    revision: '2026-08-15 11:59:59+00',
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment,
                }),
            ).toEqual({ status: 'conflict' })
            expect(
                await repository.update({
                    id: seeded.id,
                    revision: '2026-08-15 12:00:00+00',
                    formVersion: '2099-01-01',
                    assessment,
                }),
            ).toEqual({ status: 'unsupported' })
            expect(
                await repository.update({
                    id: historical.id,
                    revision: '2026-08-15 12:00:00+00',
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment,
                }),
            ).toEqual({ status: 'unsupported' })
            expect(await database.select().from(schema.assessmentResponses)).toEqual(before)
            expect(await repository.findEditable(seeded.id)).toMatchObject({
                status: 'found',
                record: { assessment: { institution: seeded.submission.institution } },
            })
        })

        it('rolls the parent and response changes back when replacing a child fails', async () => {
            const seeded = await seedEditableAssessment(database)
            const repository = createDrizzleAdminAssessmentRepository(database as never)
            const loaded = await repository.findEditable(seeded.id)
            if (loaded.status !== 'found') throw new Error('Expected editable fixture')
            const invalid = editableSubmission({ institution: 'Rollback requerido' })
            invalid.photos = [
                {
                    mimeType: 'image/png' as 'image/jpeg',
                    size: 4,
                    data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64'),
                },
            ]

            await expect(
                repository.update({
                    id: seeded.id,
                    revision: loaded.record.revision,
                    formVersion: CURRENT_ASSESSMENT_FORM_VERSION,
                    assessment: invalid,
                }),
            ).rejects.toThrow()

            const reloaded = await repository.findEditable(seeded.id)
            expect(reloaded).toMatchObject({
                status: 'found',
                record: { assessment: { institution: seeded.submission.institution } },
            })
        })
    })
})
