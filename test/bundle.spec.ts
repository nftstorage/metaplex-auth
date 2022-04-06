import { describe, it } from 'mocha'
import { expect } from 'chai'

import { NFTBundle } from '../src/nft/index.js'
import { File } from '../src/platform.js'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'

describe('NFTBundle', () => {
  describe('addNFT', () => {
    it('adds an entry to the manifest', async () => {
      const { image, metadata } = makeRandomNFT()

      const bundle = new NFTBundle()
      await bundle.addNFT(metadata, image)
      const manifest = bundle.manifest()
      expect(manifest.nfts).to.have.length(1)
      expect(manifest.nfts[0]?.assets).to.not.be.null
      expect(manifest.nfts[0]?.metadata).to.not.be.null
    })
  })

  describe('asCAR', () => {
    it('contains all of the added NFTs', async () => {
      const bundle = new NFTBundle()
      const n = 10
      let metadataCIDs = []
      let assetCIDs = []

      for (let i = 0; i < n; i++) {
        const { metadata, image } = makeRandomNFT()
        const nft = await bundle.addNFT(metadata, image)
        metadataCIDs.push(nft.encodedMetadata.cid)
        assetCIDs.push(nft.encodedAssets.cid)
      }

      const car = await bundle.asCAR()

      // check the root block - it should be a dag-cbor "manifest" object
      // that links to all of the nfts.
      const roots = await car.getRoots()
      expect(roots).to.have.length(1)
      const rootBlock = await car.get(roots[0]!)
      expect(rootBlock).to.not.be.undefined

      // car.get returns a "raw" block of bytes. Block.decode will decode the dag-cbor object inside
      const ipldBlock = await Block.decode({
        bytes: rootBlock!.bytes,
        codec: dagCbor,
        hasher: sha256,
      })
      // ipldBlock.value should be equal to the bundle manifest object
      expect(ipldBlock.value).to.not.be.null
      expect(ipldBlock.value).to.haveOwnProperty('nfts')
      expect(ipldBlock.value).to.deep.equal(bundle.manifest())

      for (const cid of [...metadataCIDs, ...assetCIDs]) {
        const block = await car.get(cid)
        expect(block).to.not.be.undefined
      }
    })
  })
})

function makeRandomNFT() {
  const image = new File(
    ['pretend-this-is-image-data-' + Math.random()],
    'image.png',
    {
      type: 'image/png',
    }
  )
  const metadata = {
    image: 'image.png',
    name: 'Best NFT ever #' + Math.random(),
    description: 'you have to see it to believe',
    properties: {
      files: [{ uri: 'image.png', type: 'image/png' }],
    },
  }
  return { image, metadata }
}
