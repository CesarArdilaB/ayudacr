import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

if (typeof window !== 'undefined') {
    Object.defineProperty(window, 'scrollTo', {
        value: () => undefined,
        writable: true,
    })
}

afterEach(() => {
    cleanup()
})
