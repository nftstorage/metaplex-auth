import { describe, it } from 'mocha'
import { expect } from 'chai'
import path from 'path'
import { loadNFTFromFilesystem } from '../src/nft'

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
    expect(nft.metadataURI).to.contain('ipfs://')
    expect(nft.metadataURI).to.contain(nft.rootCID.toString())
    expect(nft.metadataURI).to.contain('metadata.json')
    expect(nft.metadata.image).to.contain('https://')
    expect(nft.metadata.image).to.contain(nft.assetRootCID.toString())
    expect(nft.metadata.image).to.contain('token.png')
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
    expect(nft.metadataURI).to.contain('ipfs://')
    expect(nft.metadataURI).to.contain(nft.rootCID.toString())
    expect(nft.metadataURI).to.contain('metadata.json')
    expect(nft.metadata.image).to.contain('https://')
    expect(nft.metadata.image).to.contain(nft.assetRootCID.toString())
    expect(nft.metadata.image).to.contain('token.png')
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
    expect(nft.metadataURI).to.contain('ipfs://')
    expect(nft.metadataURI).to.contain(nft.rootCID.toString())
    expect(nft.metadataURI).to.contain('metadata.json')
    expect(nft.metadata.image).to.contain('https://')
    expect(nft.metadata.image).to.contain(nft.assetRootCID.toString())
    expect(nft.metadata.image).to.contain('token.png')
  })
})
