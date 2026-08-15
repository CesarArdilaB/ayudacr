import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./src/test/setup.ts'],
        clearMocks: true,
        // Walking the whole 44-criterion form through userEvent takes ~5s in jsdom, which sits
        // right on Vitest's 5s default and fails on slower machines.
        testTimeout: 15_000,
    },
})
