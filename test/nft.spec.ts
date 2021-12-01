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
    const expectedURI =
      'ipfs://bafybeiarsqflqrvw23zegn73yr4fgs6vccnlpu545p5trcevrf46kvkkdy/metadata.json'
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
      'ipfs://bafybeiarsqflqrvw23zegn73yr4fgs6vccnlpu545p5trcevrf46kvkkdy/metadata.json'
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
      'ipfs://bafybeiarsqflqrvw23zegn73yr4fgs6vccnlpu545p5trcevrf46kvkkdy/metadata.json'
    expect(nft.metadataURI).to.equal(expectedURI)
  })
})
