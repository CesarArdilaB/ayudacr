import { createCanvas, loadImage } from '@napi-rs/canvas'
import { describe, expect, it, vi } from 'vitest'
import {
    MAX_ASSESSMENT_PHOTO_BYTES,
    MAX_INPUT_PHOTO_BYTES,
} from '../../shared/assessment-photos.js'
import { prepareAssessmentPhoto, readPhotoDimensions } from './assessment-photos'

function jpegBlob(marker = '') {
    const markerBytes = new TextEncoder().encode(marker)
    const appLength = markerBytes.length + 2
    return new Blob(
        [
            Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, appLength >> 8, appLength & 0xff]),
            markerBytes,
            Uint8Array.from([
                0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01, 0x03, 0x01, 0x11, 0x00, 0x02,
                0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
            ]),
        ],
        { type: 'image/jpeg' },
    )
}

describe('prepareAssessmentPhoto', () => {
    it('re-encodes even a small JPEG so original EXIF bytes are not uploaded', async () => {
        const source = new File([jpegBlob('Exif GPS shelter')], 'evidence.jpg', {
            type: 'image/jpeg',
        })
        const renderer = vi.fn().mockResolvedValue(jpegBlob('pixels only'))

        const result = await prepareAssessmentPhoto(source, renderer)

        expect(renderer).toHaveBeenCalledWith(source, { width: 1, height: 1 })
        expect(atob(result.data)).not.toContain('Exif GPS shelter')
        expect(result).toMatchObject({ mimeType: 'image/jpeg', size: jpegBlob('pixels only').size })
    })

    it('rejects an oversized input before decoding it', async () => {
        const source = new File([new Uint8Array(MAX_INPUT_PHOTO_BYTES + 1)], 'huge.jpg', {
            type: 'image/jpeg',
        })
        const renderer = vi.fn()

        await expect(prepareAssessmentPhoto(source, renderer)).rejects.toThrow(
            'La foto supera 15 MB.',
        )
        expect(renderer).not.toHaveBeenCalled()
    })

    it('rejects unsupported files and renderer output above the persisted limit', async () => {
        await expect(
            prepareAssessmentPhoto(
                new File(['text'], 'notes.txt', { type: 'text/plain' }),
                vi.fn(),
            ),
        ).rejects.toThrow('Formato no compatible')

        const source = new File([jpegBlob()], 'evidence.jpg', { type: 'image/jpeg' })
        const oversized = new Blob([new Uint8Array(MAX_ASSESSMENT_PHOTO_BYTES + 1)], {
            type: 'image/jpeg',
        })
        await expect(
            prepareAssessmentPhoto(source, vi.fn().mockResolvedValue(oversized)),
        ).rejects.toThrow('No pudimos reducir la foto al tamaño permitido.')
    })

    it('reads JPEG dimensions and rejects excessive pixel counts before decoding', async () => {
        const header = Uint8Array.from([
            0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x0f, 0xa0, 0x27, 0x10, 0x03, 0x01, 0x11,
            0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00, 0xff, 0xd9,
        ])
        const source = new File([header], 'huge-pixels.jpg', { type: 'image/jpeg' })
        const renderer = vi.fn()

        await expect(readPhotoDimensions(source)).resolves.toEqual({ width: 10_000, height: 4_000 })
        await expect(prepareAssessmentPhoto(source, renderer)).rejects.toThrow(
            'La resolución de la foto es demasiado alta.',
        )
        expect(renderer).not.toHaveBeenCalled()
    })

    it('reads common lossy and lossless WebP dimensions', async () => {
        const lossy = new Uint8Array(30)
        lossy.set(new TextEncoder().encode('RIFF'), 0)
        lossy.set(new TextEncoder().encode('WEBPVP8 '), 8)
        lossy.set([0x9d, 0x01, 0x2a, 0x20, 0x03, 0x58, 0x02], 23)

        const lossless = new Uint8Array(25)
        lossless.set(new TextEncoder().encode('RIFF'), 0)
        lossless.set(new TextEncoder().encode('WEBPVP8L'), 8)
        lossless.set([0x2f, 0x1f, 0x40, 0x96, 0x00], 20)

        await expect(
            readPhotoDimensions(new File([lossy], 'lossy.webp', { type: 'image/webp' })),
        ).resolves.toEqual({ width: 800, height: 600 })
        await expect(
            readPhotoDimensions(new File([lossless], 'lossless.webp', { type: 'image/webp' })),
        ).resolves.toEqual({ width: 32, height: 602 })
    })

    it('fails closed when dimensions cannot be established', async () => {
        const renderer = vi.fn()
        const source = new File([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], 'broken.jpg', {
            type: 'image/jpeg',
        })

        await expect(prepareAssessmentPhoto(source, renderer)).rejects.toThrow(
            'No pudimos verificar las dimensiones de la foto.',
        )
        expect(renderer).not.toHaveBeenCalled()
    })

    it('runs a real JPEG through canvas, strips EXIF, resizes and cleans up', async () => {
        const sourceCanvas = createCanvas(2_000, 1_000)
        const sourceContext = sourceCanvas.getContext('2d')
        sourceContext.fillStyle = '#fcd116'
        sourceContext.fillRect(0, 0, 2_000, 1_000)
        const jpeg = new Uint8Array(sourceCanvas.toBuffer('image/jpeg'))
        const exif = new TextEncoder().encode('Exif\0\0GPS shelter coordinates')
        const withExif = new Uint8Array(jpeg.length + exif.length + 4)
        withExif.set(jpeg.subarray(0, 2), 0)
        withExif.set([0xff, 0xe1, (exif.length + 2) >> 8, (exif.length + 2) & 0xff], 2)
        withExif.set(exif, 6)
        withExif.set(jpeg.subarray(2), 6 + exif.length)
        const file = new File([withExif], 'real-exif.jpg', { type: 'image/jpeg' })
        const close = vi.fn()

        const createBitmap = vi.fn(async (blob: Blob) => {
            const bytes = await readBlob(blob)
            const image = await loadImage(bytes)
            Object.defineProperty(image, 'close', { value: close })
            return image as unknown as ImageBitmap
        })
        vi.stubGlobal('createImageBitmap', createBitmap)

        const nativeCreateElement = document.createElement.bind(document)
        const canvasSpy = vi.spyOn(document, 'createElement').mockImplementation(((
            tagName: string,
        ) => {
            if (tagName !== 'canvas') return nativeCreateElement(tagName)
            const canvas = createCanvas(1, 1)
            return {
                get width() {
                    return canvas.width
                },
                set width(value: number) {
                    canvas.width = value
                },
                get height() {
                    return canvas.height
                },
                set height(value: number) {
                    canvas.height = value
                },
                getContext: () => canvas.getContext('2d'),
                toBlob: (callback: BlobCallback, _type?: string, quality?: number) => {
                    const output = new Uint8Array(canvas.toBuffer('image/jpeg', quality ?? 0.86))
                    callback(new Blob([output], { type: 'image/jpeg' }))
                },
            } as unknown as HTMLCanvasElement
        }) as typeof document.createElement)

        try {
            const result = await prepareAssessmentPhoto(file)
            const outputBytes = Uint8Array.from(atob(result.data), (value) => value.charCodeAt(0))
            const outputImage = await loadImage(outputBytes)

            expect(new TextDecoder().decode(outputBytes)).not.toContain('GPS shelter coordinates')
            expect(outputImage.width).toBe(1_600)
            expect(outputImage.height).toBe(800)
            expect(result.size).toBeLessThanOrEqual(MAX_ASSESSMENT_PHOTO_BYTES)
            expect(createBitmap).toHaveBeenCalledWith(
                file,
                expect.objectContaining({ resizeWidth: 1_600, resizeHeight: 800 }),
            )
            expect(close).toHaveBeenCalledOnce()
        } finally {
            canvasSpy.mockRestore()
            vi.unstubAllGlobals()
        }
    })
})

function readBlob(blob: Blob): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(reader.error)
        reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer))
        reader.readAsArrayBuffer(blob)
    })
}
