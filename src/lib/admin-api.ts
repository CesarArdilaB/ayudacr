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

const DOWNLOAD_ERROR_BY_STATUS: Partial<Record<number, string>> = {
    401: 'Tu sesión expiró. Ingresá nuevamente.',
    403: 'No tenés permisos para descargar este archivo.',
    404: 'No se encontró el registro solicitado.',
}

function downloadError(response: Response): Error {
    return new Error(
        DOWNLOAD_ERROR_BY_STATUS[response.status] ||
            'No fue posible descargar el archivo. Intentá nuevamente.',
    )
}

function fallbackPdfFilename(assessmentId: string): string {
    const safeId = assessmentId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'registro'
    return `evaluacion-${safeId}.pdf`
}

function filenameFromDisposition(value: string | null, fallback: string): string {
    if (!value) return fallback

    const encoded = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)?.[1]
    const quoted = value.match(/filename\s*=\s*"([^"]+)"/i)?.[1]
    const plain = value.match(/filename\s*=\s*([^;\s]+)/i)?.[1]
    const candidate = encoded ? decodeFilename(encoded) : quoted || plain

    if (
        !candidate ||
        candidate.length > 180 ||
        candidate.includes('..') ||
        hasUnsafeFilenameCharacters(candidate) ||
        !candidate.toLowerCase().endsWith('.pdf')
    ) {
        return fallback
    }
    return candidate
}

function hasUnsafeFilenameCharacters(value: string): boolean {
    return [...value].some((character) => {
        const code = character.charCodeAt(0)
        return character === '/' || character === '\\' || code < 32 || code === 127
    })
}

function decodeFilename(value: string): string | undefined {
    try {
        return decodeURIComponent(value)
    } catch {
        return undefined
    }
}

export async function downloadAdminAssessmentPdf(
    assessmentId: string,
    signal?: AbortSignal,
): Promise<void> {
    const response = await fetch(`/api/admin/assessments/${encodeURIComponent(assessmentId)}.pdf`, {
        credentials: 'include',
        headers: { accept: 'application/pdf' },
        ...(signal ? { signal } : {}),
    })
    if (!response.ok) throw downloadError(response)

    const objectUrl = URL.createObjectURL(await response.blob())
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = filenameFromDisposition(
        response.headers.get('content-disposition'),
        fallbackPdfFilename(assessmentId),
    )
    anchor.hidden = true
    document.body.append(anchor)
    anchor.click()
    window.setTimeout(() => {
        anchor.remove()
        URL.revokeObjectURL(objectUrl)
    }, 1_500)
}

export type NativeDownloadHandle = { dispose: () => void }

export async function downloadAdminAssessmentsCsv(
    signal?: AbortSignal,
): Promise<NativeDownloadHandle> {
    const response = await fetch('/api/admin/assessments.csv', {
        method: 'HEAD',
        credentials: 'include',
        ...(signal ? { signal } : {}),
    })
    if (!response.ok) throw downloadError(response)

    const frame = document.createElement('iframe')
    frame.src = '/api/admin/assessments.csv'
    frame.title = 'Descarga de evaluaciones en CSV'
    frame.setAttribute('aria-hidden', 'true')
    frame.hidden = true
    document.body.append(frame)
    let disposed = false
    const cleanupTimer = window.setTimeout(() => dispose(), 6 * 60_000)
    function dispose() {
        if (disposed) return
        disposed = true
        window.clearTimeout(cleanupTimer)
        frame.remove()
    }
    return { dispose }
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
