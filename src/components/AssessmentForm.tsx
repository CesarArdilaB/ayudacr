import { useMemo, useState } from 'react'
import {
    ASSESSMENT_CRITERIA,
    ASSESSMENT_SECTIONS,
    type AssessmentAnswer,
    type AssessmentSubmission,
} from '../../shared/assessment.js'
import {
    COLOMBIA_DEPARTMENTS,
    municipalitiesForDepartment,
} from '../../shared/colombia-locations.js'

type AssessmentDetails = Omit<AssessmentSubmission, 'responses' | 'visitors'> & {
    visitorsText: string
}

type ResponseState = Record<
    string,
    {
        answer?: AssessmentAnswer
        comments: string
        quantities: Record<string, string>
    }
>

const answerOptions: Array<{ value: AssessmentAnswer; label: string }> = [
    { value: 'yes', label: 'Sí' },
    { value: 'no', label: 'No' },
    { value: 'not_observable', label: 'No observable' },
]

const emptyDetails: AssessmentDetails = {
    institution: '',
    visitDate: new Date().toISOString().slice(0, 10),
    municipality: '',
    department: '',
    contactName: '',
    contactRole: '',
    phone: '',
    email: '',
    protectionRiskDetails: '',
    generalObservations: '',
    visitorsText: '',
}

function Field({
    label,
    name,
    value,
    onChange,
    type = 'text',
    required = false,
    placeholder,
}: {
    label: string
    name: keyof AssessmentDetails
    value: string
    onChange: (name: keyof AssessmentDetails, value: string) => void
    type?: string
    required?: boolean
    placeholder?: string
}) {
    return (
        <label className="assessment-field">
            <span>
                {label} {required && <b aria-hidden="true">*</b>}
            </span>
            <input
                aria-label={label}
                name={name}
                value={value}
                type={type}
                required={required}
                placeholder={placeholder}
                onChange={(event) => onChange(name, event.target.value)}
            />
        </label>
    )
}

function SelectField({
    label,
    name,
    value,
    options,
    onChange,
    disabled = false,
}: {
    label: string
    name: 'department' | 'municipality'
    value: string
    options: readonly string[]
    onChange: (name: keyof AssessmentDetails, value: string) => void
    disabled?: boolean
}) {
    return (
        <label className="assessment-field">
            <span>
                {label} <b aria-hidden="true">*</b>
            </span>
            <select
                aria-label={label}
                name={name}
                value={value}
                required
                disabled={disabled}
                onChange={(event) => onChange(name, event.target.value)}
            >
                <option value="">
                    {disabled
                        ? 'Seleccioná primero el departamento'
                        : `Seleccioná ${label.toLowerCase()}`}
                </option>
                {options.map((option) => (
                    <option key={option} value={option}>
                        {option}
                    </option>
                ))}
            </select>
        </label>
    )
}

export function AssessmentForm({
    onSubmit,
}: {
    onSubmit: (submission: AssessmentSubmission) => Promise<{ id: string }>
}) {
    const [step, setStep] = useState(0)
    const [details, setDetails] = useState(emptyDetails)
    const [responses, setResponses] = useState<ResponseState>({})
    const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string }>()
    const [isSaving, setIsSaving] = useState(false)
    const [isSaved, setIsSaved] = useState(false)
    const currentSection = ASSESSMENT_SECTIONS[step - 1]
    const reviewStep = ASSESSMENT_SECTIONS.length + 1
    const totalSteps = reviewStep + 1

    const answeredCount = useMemo(
        () => Object.values(responses).filter((response) => response.answer).length,
        [responses],
    )

    function updateDetails(name: keyof AssessmentDetails, value: string) {
        setDetails((current) => ({
            ...current,
            [name]: value,
            ...(name === 'department' ? { municipality: '' } : {}),
        }))
        setMessage(undefined)
        setIsSaved(false)
    }

    function updateAnswer(criterionKey: string, answer: AssessmentAnswer) {
        setResponses((current) => ({
            ...current,
            [criterionKey]: {
                answer,
                comments: current[criterionKey]?.comments ?? '',
                quantities: current[criterionKey]?.quantities ?? {},
            },
        }))
        setMessage(undefined)
        setIsSaved(false)
    }

    function updateComments(criterionKey: string, comments: string) {
        setResponses((current) => ({
            ...current,
            [criterionKey]: {
                answer: current[criterionKey]?.answer,
                comments,
                quantities: current[criterionKey]?.quantities ?? {},
            },
        }))
        setIsSaved(false)
    }

    function updateQuantity(criterionKey: string, quantityKey: string, value: string) {
        if (value !== '' && !/^\d+$/.test(value)) return

        setResponses((current) => ({
            ...current,
            [criterionKey]: {
                answer: current[criterionKey]?.answer,
                comments: current[criterionKey]?.comments ?? '',
                quantities: {
                    ...(current[criterionKey]?.quantities ?? {}),
                    [quantityKey]: value,
                },
            },
        }))
        setMessage(undefined)
        setIsSaved(false)
    }

    function advanceFromDetails() {
        const requiredFields = [
            details.institution,
            details.visitDate,
            details.municipality,
            details.department,
            details.contactName,
        ]

        if (requiredFields.some((field) => !field.trim())) {
            setMessage({
                type: 'error',
                text: 'Completá los campos obligatorios antes de continuar.',
            })
            return
        }

        if (details.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)) {
            setMessage({
                type: 'error',
                text: 'Ingresá un correo válido o dejá el campo vacío.',
            })
            return
        }

        setMessage(undefined)
        setStep(1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    function advanceFromSection() {
        if (!currentSection) return
        const unanswered = currentSection.criteria.filter(
            (criterion) => !responses[criterion.key]?.answer,
        )

        if (unanswered.length > 0) {
            setMessage({
                type: 'error',
                text: `Faltan ${unanswered.length} criterios por responder en esta sección.`,
            })
            return
        }

        setMessage(undefined)
        setStep((current) => current + 1)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    function buildSubmission(): AssessmentSubmission {
        return {
            institution: details.institution,
            visitDate: details.visitDate,
            municipality: details.municipality,
            department: details.department,
            contactName: details.contactName,
            contactRole: details.contactRole,
            phone: details.phone,
            email: details.email,
            protectionRiskDetails: details.protectionRiskDetails,
            generalObservations: details.generalObservations,
            visitors: details.visitorsText
                .split(/\n|,/)
                .map((visitor) => visitor.trim())
                .filter(Boolean),
            responses: ASSESSMENT_CRITERIA.map((criterion) => ({
                criterionKey: criterion.key,
                answer: responses[criterion.key]?.answer as AssessmentAnswer,
                comments: responses[criterion.key]?.comments ?? '',
                quantities: Object.fromEntries(
                    Object.entries(responses[criterion.key]?.quantities ?? {})
                        .filter(([, value]) => value !== '')
                        .map(([key, value]) => [key, Number(value)]),
                ),
            })),
        }
    }

    async function saveAssessment() {
        setIsSaving(true)
        setMessage(undefined)

        try {
            const result = await onSubmit(buildSubmission())
            setMessage({
                type: 'success',
                text: `Evaluación guardada. Registro ${result.id.slice(0, 8)}.`,
            })
            setIsSaved(true)
        } catch (error) {
            setMessage({
                type: 'error',
                text:
                    error instanceof Error
                        ? error.message
                        : 'No se pudo guardar la evaluación. Revisá la conexión e intentá nuevamente.',
            })
        } finally {
            setIsSaving(false)
            window.scrollTo({ top: 0, behavior: 'smooth' })
        }
    }

    return (
        <section className="assessment-workspace" aria-label="Evaluación de alojamiento temporal">
            <aside className="assessment-rail">
                <div className="rail-kicker">Formulario PGI</div>
                <div
                    className="rail-progress"
                    role="progressbar"
                    aria-label="Progreso del formulario"
                    aria-valuemin={1}
                    aria-valuemax={totalSteps}
                    aria-valuenow={step + 1}
                >
                    <span style={{ width: `${((step + 1) / totalSteps) * 100}%` }} />
                </div>
                <p>
                    Paso {String(step + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
                </p>
                <nav aria-label="Secciones de la evaluación">
                    <button
                        className={step === 0 ? 'current' : ''}
                        type="button"
                        onClick={() => setStep(0)}
                    >
                        Datos del alojamiento
                    </button>
                    {ASSESSMENT_SECTIONS.map((section, index) => (
                        <button
                            className={step === index + 1 ? 'current' : ''}
                            type="button"
                            key={section.key}
                            disabled={index + 1 > step}
                            onClick={() => setStep(index + 1)}
                        >
                            {section.title}
                        </button>
                    ))}
                    <button className={step === reviewStep ? 'current' : ''} type="button" disabled>
                        Revisión final
                    </button>
                </nav>
                <div className="rail-count">
                    <strong>{answeredCount}</strong>
                    <span>de {ASSESSMENT_CRITERIA.length} criterios</span>
                </div>
            </aside>

            <div className="assessment-content">
                {message && (
                    <div
                        className={`assessment-message ${message.type}`}
                        role={message.type === 'error' ? 'alert' : 'status'}
                    >
                        {message.text}
                    </div>
                )}

                {step === 0 && (
                    <div className="assessment-step">
                        <header className="step-header">
                            <span className="step-number">00</span>
                            <div>
                                <p>Identificación de la visita</p>
                                <h2>Información del alojamiento</h2>
                                <span>Los campos marcados con * son obligatorios.</span>
                            </div>
                        </header>

                        <div className="details-grid">
                            <Field
                                label="Institución visitada"
                                name="institution"
                                value={details.institution}
                                onChange={updateDetails}
                                required
                            />
                            <Field
                                label="Fecha de la visita"
                                name="visitDate"
                                value={details.visitDate}
                                onChange={updateDetails}
                                type="date"
                                required
                            />
                            <SelectField
                                label="Departamento"
                                name="department"
                                value={details.department}
                                options={COLOMBIA_DEPARTMENTS}
                                onChange={updateDetails}
                            />
                            <SelectField
                                label="Municipio"
                                name="municipality"
                                value={details.municipality}
                                options={municipalitiesForDepartment(details.department)}
                                onChange={updateDetails}
                                disabled={!details.department}
                            />
                            <Field
                                label="Persona de contacto"
                                name="contactName"
                                value={details.contactName}
                                onChange={updateDetails}
                                required
                            />
                            <Field
                                label="Cargo"
                                name="contactRole"
                                value={details.contactRole}
                                onChange={updateDetails}
                            />
                            <Field
                                label="Teléfono"
                                name="phone"
                                value={details.phone}
                                onChange={updateDetails}
                                type="tel"
                            />
                            <Field
                                label="Correo"
                                name="email"
                                value={details.email}
                                onChange={updateDetails}
                                type="email"
                            />
                        </div>

                        <label className="assessment-field full-field">
                            <span>Nombres de quienes realizan la visita</span>
                            <textarea
                                value={details.visitorsText}
                                onChange={(event) =>
                                    updateDetails('visitorsText', event.target.value)
                                }
                                placeholder="Un nombre por línea"
                                rows={4}
                            />
                        </label>

                        <div className="step-actions end">
                            <button
                                className="assessment-primary"
                                type="button"
                                onClick={advanceFromDetails}
                            >
                                Comenzar evaluación <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>
                )}

                {currentSection && (
                    <div className="assessment-step">
                        <header className="step-header">
                            <span className="step-number">{String(step).padStart(2, '0')}</span>
                            <div>
                                <p>Criterios de evaluación</p>
                                <h2>{currentSection.title}</h2>
                                <span>{currentSection.description}</span>
                            </div>
                        </header>

                        <div className="criteria-list">
                            {currentSection.criteria.map((criterion, index) => (
                                <article className="criterion-card" key={criterion.key}>
                                    <div className="criterion-index">
                                        {String(index + 1).padStart(2, '0')}
                                    </div>
                                    <div className="criterion-body">
                                        <fieldset>
                                            <legend>{criterion.label}</legend>
                                            <div className="answer-options">
                                                {answerOptions.map((option) => (
                                                    <label key={option.value}>
                                                        <input
                                                            type="radio"
                                                            name={criterion.key}
                                                            value={option.value}
                                                            checked={
                                                                responses[criterion.key]?.answer ===
                                                                option.value
                                                            }
                                                            onChange={() =>
                                                                updateAnswer(
                                                                    criterion.key,
                                                                    option.value,
                                                                )
                                                            }
                                                        />
                                                        <span>{option.label}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </fieldset>
                                        {criterion.quantityFields && (
                                            <fieldset className="criterion-quantities">
                                                <legend>Cantidades registradas</legend>
                                                <div className="quantity-fields">
                                                    {criterion.quantityFields.map((field) => (
                                                        <label key={field.key}>
                                                            <span>{field.label}</span>
                                                            <input
                                                                aria-label={field.label}
                                                                type="number"
                                                                inputMode="numeric"
                                                                min="0"
                                                                step="1"
                                                                value={
                                                                    responses[criterion.key]
                                                                        ?.quantities[field.key] ??
                                                                    ''
                                                                }
                                                                onChange={(event) =>
                                                                    updateQuantity(
                                                                        criterion.key,
                                                                        field.key,
                                                                        event.target.value,
                                                                    )
                                                                }
                                                                placeholder="0"
                                                            />
                                                        </label>
                                                    ))}
                                                </div>
                                            </fieldset>
                                        )}
                                        <label className="criterion-comment">
                                            <span>Comentarios / observaciones</span>
                                            <textarea
                                                rows={2}
                                                value={responses[criterion.key]?.comments ?? ''}
                                                onChange={(event) =>
                                                    updateComments(
                                                        criterion.key,
                                                        event.target.value,
                                                    )
                                                }
                                                placeholder="Cantidades, ubicación, detalles o acciones requeridas…"
                                            />
                                        </label>
                                    </div>
                                </article>
                            ))}
                        </div>

                        {currentSection.key === 'protection_risks' && (
                            <label className="assessment-field full-field section-notes">
                                <span>Detalles sobre riesgos de protección</span>
                                <textarea
                                    rows={5}
                                    value={details.protectionRiskDetails}
                                    onChange={(event) =>
                                        updateDetails('protectionRiskDetails', event.target.value)
                                    }
                                    placeholder="Describa personas afectadas, ubicación, frecuencia y acciones tomadas."
                                />
                            </label>
                        )}

                        {currentSection.key === 'immediate_alerts' && (
                            <label className="assessment-field full-field section-notes">
                                <span>Observaciones generales</span>
                                <textarea
                                    rows={6}
                                    value={details.generalObservations}
                                    onChange={(event) =>
                                        updateDetails('generalObservations', event.target.value)
                                    }
                                    placeholder="Condiciones generales, población, necesidades, fortalezas, vacíos y recomendaciones."
                                />
                            </label>
                        )}

                        <div className="step-actions">
                            <button
                                className="assessment-secondary"
                                type="button"
                                onClick={() => setStep((current) => current - 1)}
                            >
                                ← Anterior
                            </button>
                            <button
                                className="assessment-primary"
                                type="button"
                                onClick={advanceFromSection}
                            >
                                {step === ASSESSMENT_SECTIONS.length
                                    ? 'Revisar evaluación'
                                    : 'Siguiente sección'}
                                <span aria-hidden="true">→</span>
                            </button>
                        </div>
                    </div>
                )}

                {step === reviewStep && (
                    <div className="assessment-step review-step">
                        <header className="step-header">
                            <span className="step-number">07</span>
                            <div>
                                <p>Verificación antes de enviar</p>
                                <h2>Revisión final</h2>
                                <span>
                                    Confirmá que la información refleja lo observado durante la
                                    visita.
                                </span>
                            </div>
                        </header>

                        <div className="review-summary">
                            <article>
                                <span>Alojamiento</span>
                                <strong>{details.institution}</strong>
                                <p>
                                    {details.municipality}, {details.department}
                                </p>
                            </article>
                            <article>
                                <span>Visita</span>
                                <strong>{details.visitDate}</strong>
                                <p>{details.contactName}</p>
                            </article>
                            <article className="response-total">
                                <span>Completitud</span>
                                <strong>
                                    {answeredCount} de {ASSESSMENT_CRITERIA.length} criterios
                                    respondidos
                                </strong>
                                <p>Formulario versión 10.08.2026</p>
                            </article>
                        </div>

                        <div className="review-warning">
                            <strong>Información sensible</strong>
                            <p>
                                Verificá que los comentarios no expongan innecesariamente datos
                                personales de población protegida.
                            </p>
                        </div>

                        <div className="step-actions">
                            <button
                                className="assessment-secondary"
                                type="button"
                                onClick={() => setStep(ASSESSMENT_SECTIONS.length)}
                            >
                                ← Volver a alertas
                            </button>
                            <button
                                className="assessment-primary save"
                                type="button"
                                disabled={
                                    isSaving ||
                                    isSaved ||
                                    answeredCount !== ASSESSMENT_CRITERIA.length
                                }
                                onClick={saveAssessment}
                            >
                                {isSaving
                                    ? 'Guardando…'
                                    : isSaved
                                      ? 'Evaluación guardada'
                                      : 'Guardar evaluación'}
                                <span aria-hidden="true">✓</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </section>
    )
}
