import { BlockstoreI, CarReader } from 'nft.storage'
import { Blockstore } from '../platform.js'
import { BlockstoreCarReader } from './bs-car-reader.js'

/**
 * An NFTBundle is a collection of Metaplex NFTs that can be packaged into a single CAR for uploading to NFT.Storage.
 */
export class NFTBundle {
  private _blockstore: BlockstoreI

  constructor() {
    this._blockstore = new Blockstore()
  }

  asCAR(): CarReader {
    // TODO: get root CID
    return new BlockstoreCarReader(1, [], this._blockstore)
  }
}
