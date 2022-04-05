import { BlockstoreI, CarReader } from 'nft.storage'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'

import { Blockstore } from '../platform.js'
import { BlockstoreCarReader } from './bs-car-reader.js'
import { prepareMetaplexNFT } from './prepare.js'
import { CID } from 'multiformats'

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
  ) {
    const nft = await prepareMetaplexNFT(metadata, imageFile, {
      ...opts,
      blockstore: this._blockstore,
    })
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

  async asCAR(): Promise<CarReader> {
    const rootBlock = await this.manifestBlock()
    await this._blockstore.put(rootBlock.cid, rootBlock.bytes)

    return new BlockstoreCarReader(1, [rootBlock.cid], this._blockstore)
  }
}
