import { ASSESSMENT_FORM_2026_08_10 } from './assessment-form-2026-08-10.js'
import {
    ASSESSMENT_PHOTO_MIME_TYPE,
    type AssessmentPhotoInput,
    decodeCanonicalBase64,
    isCompleteJpeg,
    MAX_ASSESSMENT_PHOTO_BYTES,
    MAX_ASSESSMENT_PHOTOS,
} from './assessment-photos.js'

export const ASSESSMENT_ANSWERS = ['yes', 'no', 'not_observable'] as const
export type AssessmentAnswer = (typeof ASSESSMENT_ANSWERS)[number]

export type AssessmentCriterion = {
    key: string
    label: string
    quantityFields?: readonly {
        key: string
        label: string
    }[]
}

export type AssessmentSection = {
    key: string
    title: string
    description?: string
    criteria: readonly AssessmentCriterion[]
}

export { ASSESSMENT_FORM_2026_08_10 } from './assessment-form-2026-08-10.js'

export const ASSESSMENT_SECTIONS: readonly AssessmentSection[] = ASSESSMENT_FORM_2026_08_10

export const ASSESSMENT_CRITERIA = ASSESSMENT_SECTIONS.flatMap((section) => section.criteria)

export type AssessmentResponseInput = {
    criterionKey: string
    answer: AssessmentAnswer
    comments: string
    quantities: Record<string, number>
}

export type AssessmentSubmission = {
    institution: string
    visitDate: string
    municipality: string
    department: string
    contactName: string
    contactRole: string
    phone: string
    email: string
    protectionRiskDetails: string
    generalObservations: string
    visitors: string[]
    photos: AssessmentPhotoInput[]
    responses: AssessmentResponseInput[]
}

export type AssessmentParseResult =
    | { success: true; data: AssessmentSubmission }
    | { success: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cleanString(value: unknown): string {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
}

export const ASSESSMENT_TEXT_LIMITS = {
    institution: 200,
    municipality: 100,
    department: 100,
    contactName: 120,
    contactRole: 120,
    phone: 40,
    email: 254,
    protectionRiskDetails: 5_000,
    generalObservations: 5_000,
} as const

export const MAX_ASSESSMENT_VISITORS = 20
export const MAX_ASSESSMENT_COMMENT_CHARS = 2_000

function parsePhotos(value: unknown, errors: string[]): AssessmentPhotoInput[] {
    if (value !== undefined && !Array.isArray(value)) {
        errors.push('photos must be an array')
        return []
    }
    const submittedPhotos = Array.isArray(value) ? value : []
    if (submittedPhotos.length > MAX_ASSESSMENT_PHOTOS) {
        errors.push(`A maximum of ${MAX_ASSESSMENT_PHOTOS} photos is allowed`)
    }

    const photos: AssessmentPhotoInput[] = []
    for (const [index, submittedPhoto] of submittedPhotos.entries()) {
        const number = index + 1
        if (!isRecord(submittedPhoto)) {
            errors.push(`Photo ${number} must be an object`)
            continue
        }
        const photoData = typeof submittedPhoto.data === 'string' ? submittedPhoto.data : ''
        const bytes = decodeCanonicalBase64(photoData)
        if (!bytes) {
            errors.push(`Photo ${number} must contain canonical Base64 data`)
            continue
        }
        if (submittedPhoto.mimeType !== ASSESSMENT_PHOTO_MIME_TYPE) {
            errors.push(`Photo ${number} must use ${ASSESSMENT_PHOTO_MIME_TYPE}`)
            continue
        }
        if (!isCompleteJpeg(bytes)) {
            errors.push(`Photo ${number} must contain a complete JPEG image`)
            continue
        }
        if (bytes.byteLength > MAX_ASSESSMENT_PHOTO_BYTES) {
            errors.push(`Photo ${number} exceeds the ${MAX_ASSESSMENT_PHOTO_BYTES} byte limit`)
            continue
        }
        photos.push({
            data: photoData,
            mimeType: ASSESSMENT_PHOTO_MIME_TYPE,
            size: bytes.byteLength,
        })
    }
    return photos
}

export function parseAssessmentSubmission(input: unknown): AssessmentParseResult {
    if (!isRecord(input)) {
        return { success: false, errors: ['Submission must be an object'] }
    }

    const data = {
        institution: cleanString(input.institution),
        visitDate: cleanString(input.visitDate),
        municipality: cleanString(input.municipality),
        department: cleanString(input.department),
        contactName: cleanString(input.contactName),
        contactRole: cleanString(input.contactRole),
        phone: cleanString(input.phone),
        email: cleanString(input.email).toLowerCase(),
        protectionRiskDetails: cleanString(input.protectionRiskDetails),
        generalObservations: cleanString(input.generalObservations),
        visitors: Array.isArray(input.visitors)
            ? input.visitors.map(cleanString).filter(Boolean)
            : [],
    }
    const errors: string[] = []

    for (const field of [
        'institution',
        'visitDate',
        'municipality',
        'department',
        'contactName',
    ] as const) {
        if (!data[field]) errors.push(`${field} is required`)
    }

    if (data.visitDate && !/^\d{4}-\d{2}-\d{2}$/.test(data.visitDate)) {
        errors.push('visitDate must use YYYY-MM-DD')
    }

    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push('email must be valid')
    }

    for (const [field, limit] of Object.entries(ASSESSMENT_TEXT_LIMITS) as Array<
        [keyof typeof ASSESSMENT_TEXT_LIMITS, number]
    >) {
        if (data[field].length > limit) errors.push(`${field} must be at most ${limit} characters`)
    }

    if (data.visitors.length > MAX_ASSESSMENT_VISITORS) {
        errors.push(`A maximum of ${MAX_ASSESSMENT_VISITORS} visitors is allowed`)
    }
    for (const [index, visitor] of data.visitors.entries()) {
        if (visitor.length > 120) errors.push(`visitor ${index + 1} must be at most 120 characters`)
    }

    const photos = parsePhotos(input.photos, errors)

    const submittedResponses = Array.isArray(input.responses) ? input.responses : []
    const criterionByKey = new Map(
        ASSESSMENT_CRITERIA.map((criterion) => [criterion.key, criterion] as const),
    )
    const responseByKey = new Map<string, AssessmentResponseInput>()

    for (const response of submittedResponses) {
        if (!isRecord(response)) continue
        const criterionKey = cleanString(response.criterionKey)

        const criterion = criterionByKey.get(criterionKey)
        if (!criterion) {
            errors.push(`Unknown criterion: ${criterionKey || '(empty)'}`)
            continue
        }
        if (responseByKey.has(criterionKey)) {
            errors.push(`Duplicate answer for ${criterionKey}`)
            continue
        }

        const answer = cleanString(response.answer)
        if (!ASSESSMENT_ANSWERS.includes(answer as AssessmentAnswer)) continue

        const quantities: Record<string, number> = {}
        const submittedQuantities = isRecord(response.quantities) ? response.quantities : {}
        const allowedQuantityKeys = new Set(
            criterion.quantityFields?.map((field) => field.key) ?? [],
        )

        for (const [quantityKey, quantity] of Object.entries(submittedQuantities)) {
            if (!allowedQuantityKeys.has(quantityKey)) {
                errors.push(`Unknown quantity ${quantityKey} for ${criterionKey}`)
                continue
            }
            if (typeof quantity !== 'number' || !Number.isSafeInteger(quantity) || quantity < 0) {
                errors.push(
                    `Quantity ${quantityKey} for ${criterionKey} must be a non-negative integer`,
                )
                continue
            }
            quantities[quantityKey] = quantity
        }

        const comments = cleanString(response.comments)
        if (comments.length > MAX_ASSESSMENT_COMMENT_CHARS) {
            errors.push(
                `comments for ${criterionKey} must be at most ${MAX_ASSESSMENT_COMMENT_CHARS} characters`,
            )
        }

        responseByKey.set(criterionKey, {
            criterionKey,
            answer: answer as AssessmentAnswer,
            comments,
            quantities,
        })
    }

    for (const criterion of ASSESSMENT_CRITERIA) {
        if (!responseByKey.has(criterion.key)) {
            errors.push(`A valid answer is required for ${criterion.key}`)
        }
    }

    if (errors.length > 0) return { success: false, errors }

    const orderedResponses = ASSESSMENT_CRITERIA.map((criterion) =>
        responseByKey.get(criterion.key),
    ).filter((response): response is AssessmentResponseInput => Boolean(response))

    return {
        success: true,
        data: {
            ...data,
            photos,
            responses: orderedResponses,
        },
    }
}
