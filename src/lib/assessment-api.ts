import type { AssessmentSubmission } from '../../shared/assessment.js'

type AssessmentApiResponse = { id: string }

export async function postAssessment(
    submission: AssessmentSubmission,
    fetcher: typeof fetch = fetch,
): Promise<AssessmentApiResponse> {
    const response = await fetcher('/api/assessments', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(submission),
    })
    let payload: {
        id?: string
        error?: string
        details?: string[]
    }

    try {
        payload = (await response.json()) as typeof payload
    } catch {
        payload = {}
    }

    if (response.status === 413) {
        throw new Error(
            'Las fotos exceden el tamaño permitido. Eliminá una foto o intentá nuevamente.',
        )
    }

    if (!response.ok || !payload.id) {
        if (payload.details?.includes('email must be valid')) {
            throw new Error('El correo de contacto no es válido.')
        }
        if (
            payload.details?.some(
                (detail) => detail.includes('must be at most') || detail.includes('A maximum of'),
            )
        ) {
            throw new Error('Uno de los campos supera el máximo permitido.')
        }
        throw new Error(payload.error || 'No se pudo guardar la evaluación.')
    }

    return { id: payload.id }
}
