import {
    ASSESSMENT_PHOTO_MIME_TYPE,
    type AssessmentPhotoInput,
    isCompleteJpeg,
    MAX_ASSESSMENT_PHOTO_BYTES,
    MAX_INPUT_PHOTO_BYTES,
} from '../../shared/assessment-photos.js'

const acceptedInputTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

const MAX_INPUT_PHOTO_PIXELS = 24_000_000

export type PhotoDimensions = { width: number; height: number }

function isHeic(file: File) {
    return file.type === 'image/heic' || file.type === 'image/heif' || /\.hei[cf]$/i.test(file.name)
}

export type AssessmentPhotoRenderer = (
    file: File,
    dimensions: PhotoDimensions | null,
) => Promise<Blob>

function blobToArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('No pudimos leer la foto.'))
        reader.onload = () =>
            reader.result instanceof ArrayBuffer
                ? resolve(reader.result)
                : reject(new Error('No pudimos leer la foto.'))
        reader.readAsArrayBuffer(blob)
    })
}

function jpegDimensions(bytes: Uint8Array): PhotoDimensions | null {
    let offset = 2
    while (offset + 8 < bytes.length) {
        if (bytes[offset] !== 0xff) {
            offset += 1
            continue
        }
        const marker = bytes[offset + 1]
        if (marker === undefined || marker === 0xd8 || marker === 0xd9) {
            offset += 2
            continue
        }
        if (marker >= 0xc0 && marker <= 0xc3) {
            const height = ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0)
            const width = ((bytes[offset + 7] ?? 0) << 8) | (bytes[offset + 8] ?? 0)
            return width > 0 && height > 0 ? { width, height } : null
        }
        const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0)
        if (length < 2) return null
        offset += length + 2
    }
    return null
}

function pngDimensions(bytes: Uint8Array): PhotoDimensions | null {
    if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return null
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const width = view.getUint32(16)
    const height = view.getUint32(20)
    return width > 0 && height > 0 ? { width, height } : null
}

function webpDimensions(bytes: Uint8Array): PhotoDimensions | null {
    const text = (offset: number, length: number) =>
        String.fromCharCode(...bytes.subarray(offset, offset + length))
    if (bytes.length < 25 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP') return null
    const format = text(12, 4)
    if (format === 'VP8X' && bytes.length >= 30) {
        const width = 1 + (bytes[24] ?? 0) + ((bytes[25] ?? 0) << 8) + ((bytes[26] ?? 0) << 16)
        const height = 1 + (bytes[27] ?? 0) + ((bytes[28] ?? 0) << 8) + ((bytes[29] ?? 0) << 16)
        return { width, height }
    }
    if (format === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        const width = (((bytes[27] ?? 0) << 8) | (bytes[26] ?? 0)) & 0x3fff
        const height = (((bytes[29] ?? 0) << 8) | (bytes[28] ?? 0)) & 0x3fff
        return width > 0 && height > 0 ? { width, height } : null
    }
    if (format === 'VP8L' && bytes[20] === 0x2f) {
        const width = 1 + (bytes[21] ?? 0) + (((bytes[22] ?? 0) & 0x3f) << 8)
        const height =
            1 +
            ((bytes[22] ?? 0) >> 6) +
            ((bytes[23] ?? 0) << 2) +
            (((bytes[24] ?? 0) & 0x0f) << 10)
        return width > 0 && height > 0 ? { width, height } : null
    }
    return null
}

export async function readPhotoDimensions(file: File): Promise<PhotoDimensions | null> {
    const bytes = new Uint8Array(await blobToArrayBuffer(file))
    if (file.type === 'image/jpeg') return jpegDimensions(bytes)
    if (file.type === 'image/png') return pngDimensions(bytes)
    if (file.type === 'image/webp') return webpDimensions(bytes)
    return null
}

function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('No pudimos leer la foto.'))
        reader.onload = () => {
            const result = typeof reader.result === 'string' ? reader.result : ''
            const separator = result.indexOf(',')
            if (separator < 0) {
                reject(new Error('No pudimos leer la foto.'))
                return
            }
            resolve(result.slice(separator + 1))
        }
        reader.readAsDataURL(blob)
    })
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error('No pudimos procesar la foto.'))),
            ASSESSMENT_PHOTO_MIME_TYPE,
            quality,
        )
    })
}

async function loadImage(
    file: File,
    dimensions: PhotoDimensions | null,
): Promise<{
    source: CanvasImageSource
    width: number
    height: number
    cleanup: () => void
}> {
    if (typeof createImageBitmap === 'function') {
        try {
            const scale = dimensions
                ? Math.min(1, 1600 / Math.max(dimensions.width, dimensions.height))
                : 1
            const bitmap = await createImageBitmap(file, {
                imageOrientation: 'from-image',
                ...(dimensions && scale < 1
                    ? {
                          resizeWidth: Math.max(1, Math.round(dimensions.width * scale)),
                          resizeHeight: Math.max(1, Math.round(dimensions.height * scale)),
                          resizeQuality: 'high' as const,
                      }
                    : {}),
            })
            return {
                source: bitmap,
                width: bitmap.width,
                height: bitmap.height,
                cleanup: () => bitmap.close(),
            }
        } catch {
            // Some browsers support createImageBitmap but reject formats that <img> can decode.
        }
    }

    const url = URL.createObjectURL(file)
    const image = new Image()
    image.src = url
    try {
        await image.decode()
        return {
            source: image,
            width: image.naturalWidth,
            height: image.naturalHeight,
            cleanup: () => URL.revokeObjectURL(url),
        }
    } catch (error) {
        URL.revokeObjectURL(url)
        throw error
    }
}

export async function renderAssessmentPhoto(
    file: File,
    dimensions: PhotoDimensions | null,
): Promise<Blob> {
    let decoded: Awaited<ReturnType<typeof loadImage>>
    try {
        decoded = await loadImage(file, dimensions)
    } catch {
        if (isHeic(file)) {
            throw new Error(
                'Este dispositivo no puede convertir fotos HEIC. Elegí JPEG, PNG o WebP.',
            )
        }
        throw new Error('No pudimos decodificar la foto. Elegí otra imagen.')
    }

    try {
        const initialScale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height))
        for (let attempt = 0; attempt < 8; attempt += 1) {
            const scale = initialScale * 0.84 ** attempt
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(1, Math.round(decoded.width * scale))
            canvas.height = Math.max(1, Math.round(decoded.height * scale))
            const context = canvas.getContext('2d')
            if (!context) throw new Error('No pudimos procesar la foto.')
            context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)
            const blob = await canvasBlob(canvas, Math.max(0.5, 0.86 - attempt * 0.06))
            if (blob.size <= MAX_ASSESSMENT_PHOTO_BYTES) return blob
        }
        throw new Error('No pudimos reducir la foto al tamaño permitido.')
    } finally {
        decoded.cleanup()
    }
}

export async function prepareAssessmentPhoto(
    file: File,
    renderer: AssessmentPhotoRenderer = renderAssessmentPhoto,
): Promise<AssessmentPhotoInput> {
    if (file.size > MAX_INPUT_PHOTO_BYTES) throw new Error('La foto supera 15 MB.')
    if (isHeic(file)) {
        throw new Error('Convertí la foto HEIC a JPEG antes de agregarla.')
    }
    if (!acceptedInputTypes.has(file.type) && !isHeic(file)) {
        throw new Error('Formato no compatible. Elegí una foto JPEG, PNG, WebP o HEIC.')
    }

    const dimensions = await readPhotoDimensions(file)
    if (!dimensions) throw new Error('No pudimos verificar las dimensiones de la foto.')
    if (dimensions && dimensions.width * dimensions.height > MAX_INPUT_PHOTO_PIXELS) {
        throw new Error('La resolución de la foto es demasiado alta.')
    }

    const rendered = await renderer(file, dimensions)
    if (
        rendered.type !== ASSESSMENT_PHOTO_MIME_TYPE ||
        rendered.size === 0 ||
        rendered.size > MAX_ASSESSMENT_PHOTO_BYTES
    ) {
        throw new Error('No pudimos reducir la foto al tamaño permitido.')
    }

    const data = await blobToBase64(rendered)
    const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0))
    if (!isCompleteJpeg(bytes)) throw new Error('No pudimos producir una foto JPEG válida.')

    return {
        data,
        mimeType: ASSESSMENT_PHOTO_MIME_TYPE,
        size: rendered.size,
    }
}
