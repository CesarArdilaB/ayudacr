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

export const ASSESSMENT_SECTIONS: readonly AssessmentSection[] = [
    {
        key: 'dignity',
        title: 'Dignidad y grupos con necesidades específicas de protección',
        description: 'Identifique cantidades, condiciones de acceso y trato digno.',
        criteria: [
            {
                key: 'dignity_pregnant',
                label: 'Mujeres embarazadas, gestantes o lactantes. ¿Cuántas? ¿Cuentan con espacios adecuados o prioridad?',
                quantityFields: [
                    { key: 'people', label: 'Cantidad de mujeres gestantes o lactantes' },
                ],
            },
            {
                key: 'dignity_older_people',
                label: 'Personas mayores. ¿Cuántas? ¿Están ubicadas en zonas de fácil acceso?',
                quantityFields: [{ key: 'people', label: 'Cantidad de personas mayores' }],
            },
            {
                key: 'dignity_disability',
                label: 'Personas con discapacidad. ¿Cuántas? ¿Están ubicadas en zonas de fácil acceso?',
                quantityFields: [{ key: 'people', label: 'Cantidad de personas con discapacidad' }],
            },
            {
                key: 'dignity_children',
                label: 'Niños, niñas y adolescentes. ¿Cuántos? ¿Están con sus familiares o se encuentran solos o desatendidos?',
                quantityFields: [
                    { key: 'people', label: 'Cantidad de niñas, niños y adolescentes' },
                ],
            },
            {
                key: 'dignity_ethnic_groups',
                label: 'Personas de grupos étnicos alojadas. ¿Cuáles? ¿Cómo? ¿Cuántas personas?',
                quantityFields: [
                    { key: 'people', label: 'Cantidad de personas de grupos étnicos' },
                ],
            },
            {
                key: 'dignity_population_total',
                label: 'Total de hombres y mujeres albergados.',
                quantityFields: [
                    { key: 'men', label: 'Cantidad de hombres' },
                    { key: 'women', label: 'Cantidad de mujeres' },
                ],
            },
            {
                key: 'dignity_respect_residents',
                label: 'Trato y lenguaje respetuoso entre las personas albergadas.',
            },
            {
                key: 'dignity_respect_staff',
                label: 'Trato y lenguaje respetuoso desde las personas a cargo del cuidado y la coordinación.',
            },
        ],
    },
    {
        key: 'access',
        title: 'Acceso',
        description: 'Revise infraestructura, señalización, circulación y condiciones sanitarias.',
        criteria: [
            { key: 'access_lighting', label: 'Iluminación suficiente en zonas comunes.' },
            {
                key: 'access_signage',
                label: 'Señalización de puertas de acceso, zonas de salida y zonas comunes.',
            },
            { key: 'access_separate_bathrooms', label: 'Duchas y baños separados por sexo.' },
            {
                key: 'access_bathroom_locks',
                label: 'Duchas y baños cuentan con chapas con seguro por dentro y puertas que brindan seguridad.',
            },
            {
                key: 'access_bathroom_conditions',
                label: 'Duchas y baños cuentan con iluminación y ventilación suficiente.',
            },
            {
                key: 'access_ramps',
                label: 'Lugares con facilidades de acceso, como rampas.',
            },
            {
                key: 'access_common_area_risks',
                label: 'Zonas comunes para NNA, personas mayores o con discapacidad: ¿presentan riesgos físicos o limitaciones?',
            },
            {
                key: 'access_separated_areas',
                label: 'Zonas debidamente separadas para alimentación, baños, dormitorios y recreación.',
            },
            {
                key: 'access_debris_risks',
                label: '¿Hay riesgos como cables, estructuras colapsadas o escombros? ¿Dónde?',
            },
            {
                key: 'access_clear_routes',
                label: 'Rutas de circulación despejadas, transitables y seguras.',
            },
            { key: 'access_clean_spaces', label: 'Espacios aseados y organizados.' },
        ],
    },
    {
        key: 'participation',
        title: 'Participación',
        description: 'Compruebe información, convivencia y participación de las personas alojadas.',
        criteria: [
            {
                key: 'participation_feedback_channels',
                label: 'Información visible sobre canales para peticiones, quejas, reclamos, sugerencias y felicitaciones.',
            },
            {
                key: 'participation_child_friendly_spaces',
                label: 'Espacios amigables o zonas de juego para niñas, niños y adolescentes.',
            },
            {
                key: 'participation_rules',
                label: 'Normas de convivencia visibles y entendibles.',
            },
            {
                key: 'participation_equal_assistance',
                label: 'Acceso a agua, alimentos y asistencia humanitaria garantizado para todas las personas albergadas.',
            },
            {
                key: 'participation_menstrual_hygiene',
                label: 'Disponibilidad de implementos para higiene menstrual.',
            },
            {
                key: 'participation_daily_activities',
                label: 'Actividades que realizan a diario NNA, hombres y mujeres.',
            },
            {
                key: 'participation_committees',
                label: 'Las personas albergadas asumen roles de apoyo u organización en comités. ¿Cuáles? ¿Quiénes?',
            },
        ],
    },
    {
        key: 'security',
        title: 'Seguridad',
        description:
            'Evalúe presencia responsable, privacidad, protección y percepción de seguridad.',
        criteria: [
            {
                key: 'security_identified_staff',
                label: 'Presencia permanente de personal responsable del albergue e identificado con carné.',
            },
            {
                key: 'security_balanced_staff',
                label: 'Los turnos de apoyo y coordinación cuentan con personal femenino y masculino permanente.',
            },
            {
                key: 'security_family_dormitories',
                label: 'Dormitorios separados por grupo familiar y con condiciones de privacidad.',
            },
            {
                key: 'security_service_access',
                label: 'Espacios organizados para acceder a servicios sin aglomeraciones que puedan generar conflictos.',
            },
            {
                key: 'security_sexual_abuse_prevention',
                label: 'Información visible sobre prevención de explotación y abuso sexual.',
            },
            {
                key: 'security_discrimination',
                label: '¿Se perciben actos de discriminación, exclusión o violencia hacia personas LGBTI u otros grupos diferenciados? ¿Dónde, cuáles y por qué?',
            },
            {
                key: 'security_safety_perception',
                label: '¿Las personas alojadas expresan sentirse seguras, especialmente mujeres, niñas, niños y adolescentes?',
            },
        ],
    },
    {
        key: 'protection_risks',
        title: 'Principales riesgos de protección identificados',
        description: 'Marque cualquier riesgo observado o reportado durante la visita.',
        criteria: [
            {
                key: 'risk_trafficking',
                label: 'Trata de personas o trabajos forzados.',
            },
            {
                key: 'risk_psychological_abuse',
                label: 'Abuso psicológico o estrés infligido.',
            },
            {
                key: 'risk_gender_violence',
                label: 'Violencias basadas en género o violencia sexual.',
            },
            {
                key: 'risk_disinformation',
                label: 'Desinformación o negación de acceso a la información.',
            },
            {
                key: 'risk_stigmatization',
                label: 'Discriminación y estigmatización.',
            },
            {
                key: 'risk_family_separation',
                label: 'Separación familiar forzada.',
            },
            { key: 'risk_other', label: 'Otro riesgo. ¿Cuál?' },
        ],
    },
    {
        key: 'immediate_alerts',
        title: 'Alertas inmediatas',
        description: 'Registre condiciones que requieren corrección o escalamiento inmediato.',
        criteria: [
            {
                key: 'alert_dark_areas',
                label: 'Zonas oscuras, sin señalizar o prohibidas.',
            },
            {
                key: 'alert_unsafe_bathrooms',
                label: 'Baños y duchas sin separar, señalizar, iluminar o ventilar.',
            },
            {
                key: 'alert_uncontrolled_people',
                label: 'Presencia de personal externo sin control ni identificación.',
            },
            {
                key: 'alert_negative_perception',
                label: 'Percepción negativa de la comunidad sobre la convivencia, como estrés infligido o trato degradante.',
            },
        ],
    },
]

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

        responseByKey.set(criterionKey, {
            criterionKey,
            answer: answer as AssessmentAnswer,
            comments: cleanString(response.comments),
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
            responses: orderedResponses,
        },
    }
}
