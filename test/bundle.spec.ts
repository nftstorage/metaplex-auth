import { describe, it } from 'mocha'
import chai, { expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

import { NFTBundle } from '../src/nft/index.js'
import { Blockstore, File } from '../src/platform.js'

import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagPb from '@ipld/dag-pb'

import crypto from 'crypto'
import path from 'path'
import { fileURLToPath } from 'url'
import { CID } from 'multiformats/cid'
import { BlockstoreI } from 'nft.storage'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

chai.use(chaiAsPromised)

describe('NFTBundle', () => {
  describe('addNFT', () => {
    it('adds an entry to the manifest', async () => {
      const { image, metadata } = makeRandomNFT()

      const bundle = new NFTBundle()
      const nft = await bundle.addNFT('an-id', metadata, image)
      const manifest = bundle.manifest()
      expect(manifest).to.haveOwnProperty('an-id')
      expect(manifest['an-id']?.encodedAssets.cid).to.eq(nft.encodedAssets.cid)
      expect(manifest['an-id']?.encodedMetadata.cid).to.eq(
        nft.encodedMetadata.cid
      )
    })

    it('fails to add entries with duplicate ids', async () => {
      const nft1 = makeRandomNFT()
      const nft2 = makeRandomNFT()

      const bundle = new NFTBundle()
      await bundle.addNFT('an-id', nft1.metadata, nft1.image)
      await expect(
        bundle.addNFT('an-id', nft2.metadata, nft2.image)
      ).to.be.rejectedWith('duplicate')
    })

    it('fails to add an entry with an id longer than MAX_ID_LEN', async () => {
      const bundle = new NFTBundle()
      const id = makeRandomString(NFTBundle.MAX_ID_LEN + 1)
      const { metadata, image } = makeRandomNFT()
      await expect(bundle.addNFT(id, metadata, image)).to.be.rejectedWith(
        'length'
      )
    })

    it('fails to add more than MAX_ENTRIES', async () => {
      const bundle = new NFTBundle()
      const oldMax = NFTBundle.MAX_ENTRIES
      NFTBundle.MAX_ENTRIES = 5

      try {
        for (let i = 0; i < NFTBundle.MAX_ENTRIES; i++) {
          const { metadata, image } = makeRandomNFT()
          await bundle.addNFT(i.toString(), metadata, image)
        }

        const { metadata, image } = makeRandomNFT()
        await expect(
          bundle.addNFT('too-many', metadata, image)
        ).to.be.rejectedWith(NFTBundle.MAX_ENTRIES.toString())
      } finally {
        NFTBundle.MAX_ENTRIES = oldMax
      }
    })
  })

  describe('addNFTFromFileSystem', () => {
    it('loads an NFT from disk and adds an entry to the manifest', async () => {
      const jsonPath = path.join(
        __dirname,
        'fixtures',
        'nfts',
        '01-simple-example',
        'token.json'
      )

      const bundle = new NFTBundle()
      const nft = await bundle.addNFTFromFileSystem(jsonPath, undefined, {
        id: 'an-id',
      })
      const manifest = bundle.manifest()
      expect(manifest).to.haveOwnProperty('an-id')
      expect(manifest['an-id']?.encodedAssets.cid).to.eq(nft.encodedAssets.cid)
      expect(manifest['an-id']?.encodedMetadata.cid).to.eq(
        nft.encodedMetadata.cid
      )
    })

    it('assigns an id based on metadata filename if none is given', async () => {
      const jsonPath = path.join(
        __dirname,
        'fixtures',
        'nfts',
        '01-simple-example',
        'token.json'
      )

      const bundle = new NFTBundle()
      const nft = await bundle.addNFTFromFileSystem(jsonPath)
      const manifest = bundle.manifest()
      expect(manifest).to.haveOwnProperty('token')
      expect(manifest['token']?.encodedAssets.cid).to.eq(nft.encodedAssets.cid)
      expect(manifest['token']?.encodedMetadata.cid).to.eq(
        nft.encodedMetadata.cid
      )
    })
  })

  describe('makeRootBlock', () => {
    it('contains links to all of the added NFTs', async () => {
      // inject a blockstore, so we can inspect it later & make assertions
      const blockstore = new Blockstore()
      const bundle = new NFTBundle({ blockstore })
      const n = 10
      let metadataCIDs = []
      let assetCIDs = []

      for (let i = 0; i < n; i++) {
        const { metadata, image } = makeRandomNFT()
        const nft = await bundle.addNFT(i.toString(), metadata, image)
        metadataCIDs.push(nft.encodedMetadata.cid)
        assetCIDs.push(nft.encodedAssets.cid)
      }

      const rootBlock = await bundle.makeRootBlock()
      expectRootBlockToHaveCIDs(rootBlock, blockstore, metadataCIDs, assetCIDs)
    })
  })

  describe('asCAR', () => {
    it('contains all blocks from each included NFT', async () => {
      const bundle = new NFTBundle()
      const n = 3
      let nfts = []

      for (let i = 0; i < n; i++) {
        const { metadata, image } = makeRandomNFT()
        const nft = await bundle.addNFT(i.toString(), metadata, image)
        nfts.push(nft)
      }

      const { car } = await bundle.asCAR()
      for (const nft of nfts) {
        for await (const block of nft.blockstore.blocks()) {
          expect(car.has(block.cid)).to.eventually.be.true
        }
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

function makeRandomString(size: number) {
  return crypto.randomBytes(size).toString('hex').slice(0, size)
}

async function expectRootBlockToHaveCIDs(
  rootBlock: Block.Block<dagPb.PBNode>,
  blockstore: BlockstoreI,
  metadataCIDs: CID[],
  assetCIDs: CID[]
) {
  const links = rootBlock.value.Links
  expect(links).to.have.length(metadataCIDs.length)

  // each link in the root block goes to a directory object that links to the
  // assets and metadata for each nft
  for (const link of links) {
    const bytes = await blockstore.get(link.Hash)
    expect(bytes).to.not.be.empty

    const block = await Block.decode({ bytes, codec: dagPb, hasher: sha256 })
    const metadataLink = block.value.Links.find((l) => l.Name === 'metadata')
    const assetsLink = block.value.Links.find((l) => l.Name === 'assets')
    expect(metadataLink).to.not.be.undefined
    expect(assetsLink).to.not.be.undefined

    expect(metadataCIDs.some((cid) => cid.equals(metadataLink?.Hash))).to.be
      .true
    expect(assetCIDs.some((cid) => cid.equals(assetsLink?.Hash))).to.be.true
  }
}
