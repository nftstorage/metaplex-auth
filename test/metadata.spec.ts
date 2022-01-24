import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

import { validateMetadata } from '../src/metadata/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'metadata.json')

interface Fixture {
  description: string
  content: Record<string, any>
}

interface FixtureCollection {
  valid: Fixture[]
  invalid: Fixture[]
}

describe('validateMetadata', () => {
  let fixtures: FixtureCollection

  before(async () => {
    fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, { encoding: 'utf-8' }))
  })

  it('validates a valid metaplex json manifest', () => {
    for (const fixture of fixtures.valid) {
      const { description, content } = fixture
      const valid = validateMetadata(content)
      expect(valid, 'Expected fixture to be valid: ' + description)
    }
  })

  it('does not validate an invalid manifest', () => {
    for (const fixture of fixtures.invalid) {
      const { description, content } = fixture
      const valid = validateMetadata(content)
      expect(!valid, 'Expected fixture to be invalid: ' + description)
    }
  })
})
