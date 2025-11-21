/**
 * Vitest setup file
 * Runs before all tests
 */

import { afterEach, beforeAll, vi } from 'vitest'

// Set environment variables before any imports
process.env.ROBOSYSTEMS_API_KEY = 'test-api-key'
process.env.ROBOSYSTEMS_GRAPH_ID = 'test-graph-id'
process.env.VITEST = 'true'

// Mock global fetch if it doesn't exist (Node.js environment)
beforeAll(() => {
  if (!global.fetch) {
    global.fetch = vi.fn()
  }
})

// Clean up after each test
afterEach(() => {
  vi.clearAllMocks()
})
