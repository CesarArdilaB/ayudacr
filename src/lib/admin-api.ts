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
