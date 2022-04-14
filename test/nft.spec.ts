import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import { fileURLToPath } from 'url'

import {
  loadAllNFTsFromDirectory,
  loadNFTFromFilesystem,
} from '../src/nft/index.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('loadNFTFromFilesystem', () => {
  it('finds image file with same name as metadata json if image field is empty', async () => {
    const jsonPath = path.join(
      __dirname,
      'fixtures',
      'nfts',
      '01-simple-example',
      'token.json'
    )
    const nft = await loadNFTFromFilesystem(jsonPath)
    const expectedURI =
      'ipfs://bafybeiha2he3pyzhlvr444ihcwu4vglcatatqr7li37rwly76m5j7wizde/metadata.json'
    expect(nft.metadataURI).to.equal(expectedURI)
  })

  it('finds image file if json "image" field contains valid file path', async () => {
    const jsonPath = path.join(
      __dirname,
      'fixtures',
      'nfts',
      '01-simple-example',
      'image-path-in-image-field.json'
    )
    const nft = await loadNFTFromFilesystem(jsonPath)
    const expectedURI =
      'ipfs://bafybeiha2he3pyzhlvr444ihcwu4vglcatatqr7li37rwly76m5j7wizde/metadata.json'
    expect(nft.metadataURI).to.equal(expectedURI)
  })

  it('works with a manually specified imageFilePath', async () => {
    const jsonPath = path.join(
      __dirname,
      'fixtures',
      'nfts',
      '01-simple-example',
      'token.json'
    )
    const imagePath = path.join(
      __dirname,
      'fixtures',
      'nfts',
      '01-simple-example',
      'token.png'
    )
    const nft = await loadNFTFromFilesystem(jsonPath, imagePath)
    const expectedURI =
      'ipfs://bafybeiha2he3pyzhlvr444ihcwu4vglcatatqr7li37rwly76m5j7wizde/metadata.json'
    expect(nft.metadataURI).to.equal(expectedURI)
  })
})

describe('loadAllNFTsFromDirectory', () => {
  it('discovers all metadata json files in a single directory', async () => {
    const dirPath = path.join(
      __dirname,
      'fixtures',
      'nfts',
      '02-load-directory-flat'
    )
    let count = 0
    for await (const nft of loadAllNFTsFromDirectory(dirPath)) {
      expect(nft.metadataURI).to.include('ipfs://')
      expect(nft.encodedAssets.cid).to.not.be.null
      count += 1
    }
    expect(count === 4)
  })

  it('discovers all metadata json files in nested directories', async () => {
    const dirPath = path.join(
      __dirname,
      'fixtures',
      'nfts',
      '03-load-directory-nested'
    )
    let count = 0
    for await (const nft of loadAllNFTsFromDirectory(dirPath)) {
      expect(nft.metadataURI).to.include('ipfs://')
      expect(nft.encodedAssets.cid).to.not.be.null
      count += 1
    }
    expect(count === 4)
  })
})
