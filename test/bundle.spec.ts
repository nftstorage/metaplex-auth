import { describe, it } from 'mocha'
import { expect } from 'chai'

import { NFTBundle } from '../src/nft/index.js'
import { File } from '../src/platform.js'

describe('NFTBundle', () => {
  describe('addNFT', () => {
    it('adds an entry to the manifest', async () => {
      const imageFile = new File(['not really an image...'], 'image.png', {
        type: 'image/png',
      })
      const metadata = {
        image: 'image.png',
        name: 'Best NFT ever',
        description: 'you have to see it to believe',
        properties: {
          files: [{ uri: 'image.png', type: 'image/png' }],
        },
      }

      const bundle = new NFTBundle()
      await bundle.addNFT(metadata, imageFile)
      const manifest = bundle.manifest()
      expect(manifest.nfts).to.have.length(1)
      expect(manifest.nfts[0]?.assets).to.not.be.null
      expect(manifest.nfts[0]?.metadata).to.not.be.null
    })
  })
})
