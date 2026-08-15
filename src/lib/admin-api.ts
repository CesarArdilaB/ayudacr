export type AdminAssessment = {
    id: string
    institution: string
    visitDate: string
    municipality: string
    department: string
    createdAt: string
    createdBy: { name: string; email: string }
    responseCount: number
}

export type NewEvaluator = { name: string; email: string; password: string }

async function parseResponse<T>(response: Response): Promise<T> {
    const body = (await response.json()) as T & { error?: string }
    if (!response.ok) throw new Error(body.error || 'La solicitud no pudo completarse.')
    return body
}

export async function listAdminAssessments(): Promise<{ records: AdminAssessment[] }> {
    return parseResponse(
        await fetch('/api/admin/assessments', {
            credentials: 'include',
            headers: { accept: 'application/json' },
        }),
    )
}

export async function createEvaluator(
    input: NewEvaluator,
): Promise<{ user: { id: string; name: string; email: string } }> {
    return parseResponse(
        await fetch('/api/admin/users', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        }),
    )
}
