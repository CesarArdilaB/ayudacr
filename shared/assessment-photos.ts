export const MAX_ASSESSMENT_PHOTOS = 4
export const MAX_ASSESSMENT_PHOTO_BYTES = 300 * 1024
export const MAX_INPUT_PHOTO_BYTES = 15 * 1024 * 1024
export const ASSESSMENT_PHOTO_MIME_TYPE = 'image/jpeg' as const

export type AssessmentPhotoInput = {
    data: string
    mimeType: typeof ASSESSMENT_PHOTO_MIME_TYPE
    size: number
}

const canonicalBase64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/

export function decodeCanonicalBase64(value: unknown): Uint8Array | null {
    if (
        typeof value !== 'string' ||
        value.length === 0 ||
        value.length % 4 !== 0 ||
        !canonicalBase64Pattern.test(value)
    ) {
        return null
    }

    try {
        const binary = atob(value)
        const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
        return btoa(binary) === value ? bytes : null
    } catch {
        return null
    }
}

export function isCompleteJpeg(bytes: Uint8Array): boolean {
    return (
        bytes.length >= 6 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff &&
        bytes.at(-2) === 0xff &&
        bytes.at(-1) === 0xd9
    )
}
