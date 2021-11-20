import { describe, it } from 'mocha'
import { expect } from 'chai'

import fixtures from './fixtures/metadata.json'
import { validateMetadata } from '../src/metadata'

describe('validateMetadata', () => {
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