import { BlockstoreI } from 'nft.storage'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'

import { Blockstore } from '../platform.js'
import { BlockstoreCarReader } from './bs-car-reader.js'
import { PackagedNFT, prepareMetaplexNFT } from './prepare.js'
import { CID } from 'multiformats'
import { loadAllNFTsFromDirectory, loadNFTFromFilesystem } from './load.js'
import type { EncodedCar } from './prepare.js'

export type NFTManifestEntry = {
  metadata: CID
  assets: CID
}

export type NFTManifest = {
  nfts: NFTManifestEntry[]
}

/**
 * An NFTBundle is a collection of Metaplex NFTs that can be packaged into a single CAR for uploading to NFT.Storage.
 */
export class NFTBundle {
  private _blockstore: BlockstoreI
  private _nfts: NFTManifestEntry[]

  constructor() {
    this._blockstore = new Blockstore()
    this._nfts = []
  }

  async addNFT(
    metadata: Record<string, any>,
    imageFile: File,
    opts: {
      additionalAssetFiles?: File[]
    } = {}
  ): Promise<PackagedNFT> {
    const nft = await prepareMetaplexNFT(metadata, imageFile, {
      ...opts,
      blockstore: this._blockstore,
    })
    this._addManifestEntry(nft)
    return nft
  }

  async addNFTFromFileSystem(
    metadataFilePath: string,
    imageFilePath?: string,
    opts: {
      validateSchema?: boolean
      gatewayHost?: string
    } = {}
  ): Promise<PackagedNFT> {
    const nft = await loadNFTFromFilesystem(metadataFilePath, imageFilePath, {
      ...opts,
      blockstore: this._blockstore,
    })
    this._addManifestEntry(nft)
    return nft
  }

  async *addAllNFTsFromDirectory(
    directoryPath: string,
    opts: {
      validateSchema?: boolean
      gatewayHost?: string
    } = {}
  ): AsyncGenerator<PackagedNFT> {
    for await (const nft of loadAllNFTsFromDirectory(directoryPath, {
      ...opts,
      blockstore: this._blockstore,
    })) {
      this._addManifestEntry(nft)
      yield nft
    }
  }

  private _addManifestEntry(nft: PackagedNFT) {
    const entry = {
      metadata: nft.encodedMetadata.cid,
      assets: nft.encodedAssets.cid,
    }
    this._nfts.push(entry)
  }

  manifest(): NFTManifest {
    return {
      nfts: this._nfts,
    }
  }

  async manifestBlock(): Promise<Block.Block<unknown>> {
    const rootDAG = this.manifest()
    return Block.encode({ value: rootDAG, codec: dagCbor, hasher: sha256 })
  }

  async asCAR(): Promise<EncodedCar> {
    const rootBlock = await this.manifestBlock()
    await this._blockstore.put(rootBlock.cid, rootBlock.bytes)

    const car = new BlockstoreCarReader(1, [rootBlock.cid], this._blockstore)
    const cid = rootBlock.cid
    return { car, cid }
  }
}
