import { describe, it } from 'mocha'
import { expect } from 'chai'

import { NFTBundle } from '../src/nft/index.js'

describe('NFTBundle', () => {
  it('exits', () => {
    expect(new NFTBundle()).to.not.throw
  })
})
