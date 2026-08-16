import { sql } from 'drizzle-orm'
import {
    boolean,
    check,
    customType,
    date,
    index,
    integer,
    jsonb,
    pgEnum,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
    uuid,
} from 'drizzle-orm/pg-core'

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
    dataType: () => 'bytea',
})

export const userRole = pgEnum('user_role', ['evaluator', 'super_admin'])

export const user = pgTable(
    'user',
    {
        id: text('id').primaryKey(),
        name: text('name').notNull(),
        email: text('email').notNull(),
        emailVerified: boolean('emailVerified').default(false).notNull(),
        image: text('image'),
        role: userRole('role').default('evaluator').notNull(),
        createdAt: timestamp('createdAt').defaultNow().notNull(),
        updatedAt: timestamp('updatedAt').defaultNow().notNull(),
    },
    (table) => [uniqueIndex('user_email_uidx').on(table.email)],
)

export const session = pgTable(
    'session',
    {
        id: text('id').primaryKey(),
        expiresAt: timestamp('expiresAt').notNull(),
        token: text('token').notNull(),
        createdAt: timestamp('createdAt').defaultNow().notNull(),
        updatedAt: timestamp('updatedAt').defaultNow().notNull(),
        ipAddress: text('ipAddress'),
        userAgent: text('userAgent'),
        userId: text('userId')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
    },
    (table) => [
        uniqueIndex('session_token_uidx').on(table.token),
        index('session_user_id_idx').on(table.userId),
    ],
)

export const account = pgTable(
    'account',
    {
        id: text('id').primaryKey(),
        accountId: text('accountId').notNull(),
        providerId: text('providerId').notNull(),
        userId: text('userId')
            .notNull()
            .references(() => user.id, { onDelete: 'cascade' }),
        accessToken: text('accessToken'),
        refreshToken: text('refreshToken'),
        idToken: text('idToken'),
        accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
        refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
        scope: text('scope'),
        password: text('password'),
        createdAt: timestamp('createdAt').defaultNow().notNull(),
        updatedAt: timestamp('updatedAt').defaultNow().notNull(),
    },
    (table) => [index('account_user_id_idx').on(table.userId)],
)

export const verification = pgTable(
    'verification',
    {
        id: text('id').primaryKey(),
        identifier: text('identifier').notNull(),
        value: text('value').notNull(),
        expiresAt: timestamp('expiresAt').notNull(),
        createdAt: timestamp('createdAt').defaultNow().notNull(),
        updatedAt: timestamp('updatedAt').defaultNow().notNull(),
    },
    (table) => [index('verification_identifier_idx').on(table.identifier)],
)

export const assessmentAnswer = pgEnum('assessment_answer', ['yes', 'no', 'not_observable'])

export const shelterAssessments = pgTable(
    'shelter_assessments',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        formVersion: text('form_version').notNull().default('2026-08-10'),
        institution: text('institution').notNull(),
        visitDate: date('visit_date', { mode: 'string' }).notNull(),
        municipality: text('municipality').notNull(),
        department: text('department').notNull(),
        contactName: text('contact_name').notNull(),
        contactRole: text('contact_role').notNull().default(''),
        phone: text('phone').notNull().default(''),
        email: text('email').notNull().default(''),
        protectionRiskDetails: text('protection_risk_details').notNull().default(''),
        generalObservations: text('general_observations').notNull().default(''),
        visitors: jsonb('visitors').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
        createdByUserId: text('created_by_user_id')
            .notNull()
            .references(() => user.id),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('shelter_assessments_created_by_idx').on(table.createdByUserId),
        index('shelter_assessments_visit_date_idx').on(table.visitDate),
        index('shelter_assessments_created_at_id_idx').on(table.createdAt.desc(), table.id.desc()),
    ],
)

export const assessmentResponses = pgTable(
    'assessment_responses',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        assessmentId: uuid('assessment_id')
            .notNull()
            .references(() => shelterAssessments.id, { onDelete: 'cascade' }),
        criterionKey: text('criterion_key').notNull(),
        answer: assessmentAnswer('answer').notNull(),
        comments: text('comments').notNull().default(''),
        quantities: jsonb('quantities')
            .$type<Record<string, number>>()
            .notNull()
            .default(sql`'{}'::jsonb`),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('assessment_responses_assessment_idx').on(table.assessmentId),
        uniqueIndex('assessment_responses_assessment_criterion_uidx').on(
            table.assessmentId,
            table.criterionKey,
        ),
    ],
)

export const assessmentPhotos = pgTable(
    'assessment_photos',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        assessmentId: uuid('assessment_id')
            .notNull()
            .references(() => shelterAssessments.id, { onDelete: 'cascade' }),
        position: integer('position').notNull(),
        mimeType: text('mime_type').notNull(),
        size: integer('size').notNull(),
        data: bytea('data').notNull(),
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => [
        index('assessment_photos_assessment_idx').on(table.assessmentId),
        uniqueIndex('assessment_photos_assessment_position_uidx').on(
            table.assessmentId,
            table.position,
        ),
        check(
            'assessment_photos_position_check',
            sql`${table.position} >= 0 AND ${table.position} < 4`,
        ),
        check('assessment_photos_mime_check', sql`${table.mimeType} = 'image/jpeg'`),
        check(
            'assessment_photos_size_check',
            sql`${table.size} > 0 AND ${table.size} <= 307200 AND ${table.size} = octet_length(${table.data})`,
        ),
    ],
)

export type NewShelterAssessment = typeof shelterAssessments.$inferInsert
export type NewAssessmentResponse = typeof assessmentResponses.$inferInsert
export type NewAssessmentPhoto = typeof assessmentPhotos.$inferInsert
