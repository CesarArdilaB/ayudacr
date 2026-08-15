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
    const payload = (await response.json()) as { id?: string; error?: string }

    if (!response.ok || !payload.id) {
        throw new Error(payload.error || 'No se pudo guardar la evaluación.')
    }

    return { id: payload.id }
}
