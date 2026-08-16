import type { AssessmentSection } from './assessment.js'

export const ASSESSMENT_FORM_2026_08_10 = [
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
] as const satisfies readonly AssessmentSection[]
