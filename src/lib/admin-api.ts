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

export type AdminUser = {
    id: string
    name: string
    email: string
    role: 'evaluator' | 'super_admin'
    createdAt: string
}

export type NewEvaluator = { name: string; email: string; password: string }

async function parseResponse<T>(response: Response): Promise<T> {
    let body: (T & { error?: string }) | undefined
    try {
        body = (await response.json()) as T & { error?: string }
    } catch {
        throw new Error('La solicitud no pudo completarse.')
    }
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

export async function listAdminUsers(): Promise<{ users: AdminUser[] }> {
    return parseResponse(
        await fetch('/api/admin/users', {
            credentials: 'include',
            headers: { accept: 'application/json' },
        }),
    )
}

export async function createEvaluator(input: NewEvaluator): Promise<{ user: AdminUser }> {
    return parseResponse(
        await fetch('/api/admin/users', {
            method: 'POST',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
        }),
    )
}

export async function updateAdminUserPassword(
    userId: string,
    password: string,
): Promise<{ success: true }> {
    return parseResponse(
        await fetch(`/api/admin/users/${encodeURIComponent(userId)}/password`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password }),
        }),
    )
}

export async function promoteAdminUser(userId: string): Promise<{ user: AdminUser }> {
    return parseResponse(
        await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ role: 'super_admin' }),
        }),
    )
}
