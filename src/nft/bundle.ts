import { BlockstoreI } from 'nft.storage'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagPb from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import { path } from '../platform.js'

import { Blockstore } from '../platform.js'
import { BlockstoreCarReader } from './bs-car-reader.js'
import { PackagedNFT, prepareMetaplexNFT } from './prepare.js'
import { loadNFTFromFilesystem } from './load.js'
import type { EncodedCar } from './prepare.js'
import { CID } from 'multiformats'

/**
 * An NFTBundle is a collection of Metaplex NFTs that can be packaged into a single CAR for uploading to NFT.Storage.
 */
export class NFTBundle {
  private _blockstore: BlockstoreI
  private _nfts: Record<string, PackagedNFT>

  constructor() {
    this._blockstore = new Blockstore()
    this._nfts = {}
  }

  async addNFT(
    id: string,
    metadata: Record<string, any>,
    imageFile: File,
    opts: {
      validateSchema?: boolean
      gatewayHost?: string
      additionalAssetFiles?: File[]
    } = {}
  ): Promise<PackagedNFT> {
    const nft = await prepareMetaplexNFT(metadata, imageFile, {
      ...opts,
      blockstore: this._blockstore,
    })
    this._addManifestEntry(id, nft)
    return nft
  }

  async addNFTFromFileSystem(
    metadataFilePath: string,
    imageFilePath?: string,
    opts: {
      id?: string
      validateSchema?: boolean
      gatewayHost?: string
    } = {}
  ): Promise<PackagedNFT> {
    let id = opts.id
    if (!id) {
      id = path.basename(metadataFilePath, '.json')
    }

    const nft = await loadNFTFromFilesystem(metadataFilePath, imageFilePath, {
      ...opts,
      blockstore: this._blockstore,
    })
    this._addManifestEntry(id, nft)
    return nft
  }

  private _addManifestEntry(id: string, nft: PackagedNFT) {
    if (id in this._nfts) {
      throw new Error(
        `duplicate id in bundle: an entry with id "${id}" has already been added.`
      )
    }
    this._nfts[id] = nft
  }

  manifest(): Record<string, PackagedNFT> {
    // make a copy of the manifest object, in case the caller wants to mutate
    return { ...this._nfts }
  }

  async makeRootBlock(): Promise<Block.Block<dagPb.PBNode>> {
    let links: dagPb.PBLink[] = []
    for (const [id, nft] of Object.entries(this._nfts)) {
      const dir = await wrapperDirForNFT(nft)
      const link = dagPb.createLink(id, dir.bytes.byteLength, dir.cid)

      await this._blockstore.put(dir.cid, dir.bytes)
      links.push(link)
    }

    return makeDirectoryBlock(links)
  }

  async getRawSize(): Promise<number> {
    let size = 0
    for await (const block of this._blockstore.blocks()) {
      size += block.bytes.byteLength
    }
    return size
  }

  // Exposed publicly so we can test pathing through the root block.
  async getRawBlock(cid: CID): Promise<Uint8Array> {
    return this._blockstore.get(cid)
  }

  async asCAR(): Promise<EncodedCar> {
    const rootBlock = await this.makeRootBlock()
    await this._blockstore.put(rootBlock.cid, rootBlock.bytes)

    const car = new BlockstoreCarReader(1, [rootBlock.cid], this._blockstore)
    const cid = rootBlock.cid
    return { car, cid }
  }
}

/**
 * Makes a dag-pb / unixfs directory that links to the `assets` and `metadata` directories
 * in the PackagedNFT.
 * @param nft
 * @returns
 */
async function wrapperDirForNFT(
  nft: PackagedNFT
): Promise<Block.Block<dagPb.PBNode>> {
  const metadataBlock = await nft.encodedMetadata.car.get(
    nft.encodedMetadata.cid
  )
  const assetsBlock = await nft.encodedAssets.car.get(nft.encodedAssets.cid)
  if (!metadataBlock || !assetsBlock) {
    throw new Error(`invalid PackagedNFT: missing root blocks`)
  }

  const metadataLink = dagPb.createLink(
    'metadata',
    metadataBlock.bytes.byteLength,
    nft.encodedMetadata.cid
  )
  const assetsLink = dagPb.createLink(
    'assets',
    assetsBlock.bytes.byteLength,
    nft.encodedAssets.cid
  )

  return makeDirectoryBlock([assetsLink, metadataLink])
}

async function makeDirectoryBlock(
  links: dagPb.PBLink[]
): Promise<Block.Block<dagPb.PBNode>> {
  const data = new UnixFS({ type: 'directory' }).marshal()
  const value = dagPb.createNode(data, links)
  return Block.encode({ value, codec: dagPb, hasher: sha256 })
}
