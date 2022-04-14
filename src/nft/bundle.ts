import { BlockstoreI } from 'nft.storage'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagPb from '@ipld/dag-pb'
import { UnixFS } from 'ipfs-unixfs'
import { path } from '../platform.js'

import { Blockstore, TextEncoder } from '../platform.js'
import { BlockstoreCarReader } from './bs-car-reader.js'
import { PackagedNFT, prepareMetaplexNFT } from './prepare.js'
import { loadNFTFromFilesystem } from './load.js'
import type { EncodedCar } from './prepare.js'

/**
 * An NFTBundle is a collection of Metaplex NFTs that can be packaged into a single CAR for uploading to NFT.Storage.
 *
 * All added NFTs require a unique ID string, which will be used to link from the root directory object to the
 * `assets` and `metadata` directories for that NFT.
 *
 * For example, if you add nfts with the ids `a`, `b`, and `c`, you'll end up with a root directory tree like this:
 *
 * ```
 * .
 * ├── a
 * │   ├── assets
 * │   │   └── image.png
 * │   └── metadata
 * │       └── metadata.json
 * ├── b
 * │   ├── assets
 * │   │   └── image.png
 * │   └── metadata
 * │       └── metadata.json
 * └── c
 *     ├── assets
 *     │   └── image.png
 *     └── metadata
 *         └── metadata.json
 * ```
 *
 * When using {@link addNFTFromFileSystem}, the id will be derived from the metadata json filename, unless an `id` option is provided.
 * This should play nice with the default candy-machine directory structure, where each json file has a unique name (e.g. 0.json, etc).
 * If you're using a different naming convention, you should pass in explicit ids to avoid duplicate entries, which will fail.
 *
 */
export class NFTBundle {
  /** Maximum NFTs a bundle can support.
   *
   * This is currently limited by the size of the root block, which must stay below 256 kib
   * to be a valid "simple" (non-sharded) UnixFS directory object. May be increased in the
   * future by switching to sharded directories for the root object.
   */
  static MAX_ENTRIES = 2200

  /**
   * Maximum byte length for each NFT id string (encoded as UTF-8).
   *
   * Maximum length is enforced to ensure we can fit MAX_ENTRIES in a single root block.
   * With 64 byte ids, each link in the root block takes a max of 114 bytes, which gives
   * us 2299 max entries to stay below 256 kib.
   *
   * If you change this value, make sure to recalculate and change MAX_ENTRIES to stay below the hard limit.
   */
  static MAX_ID_LEN = 64

  private _blockstore: BlockstoreI
  private _nfts: Record<string, PackagedNFT>

  /**
   *
   * @param opts
   * @param opts.blockstore use the given Blockstore instance (useful for testing).
   */
  constructor(
    opts: {
      blockstore?: BlockstoreI
    } = {}
  ) {
    this._blockstore = opts.blockstore || new Blockstore()
    this._nfts = {}
  }

  /**
   * Adds a {@link PackagedNFT} to the bundle.
   *
   * @param id an identifier for the NFT that will be used to create links from the bundle root directory object to the NFT data. Must be unique within the bundle.
   * @param metadata a JS object containing Metaplex NFT metadata
   * @param imageFile a File object containing image data for the main NFT image
   * @param opts
   * @param opts.validateSchema if true, validate the metadata using a JSON schema before adding. off by default.
   * @param opts.gatewayHost override the default HTTP gateway to use in metadata links. Must include scheme, e.g. "https://dweb.link" instead of just "dweb.link". Default is "https://nftstorage.link".
   * @returns a Promise that resolves to the input `PackagedNFT` object on success.
   */
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
    this._enforceMaxEntries()
    this._enforceMaxIdLength(id)

    const nft = await prepareMetaplexNFT(metadata, imageFile, {
      ...opts,
      blockstore: this._blockstore,
    })
    this._addManifestEntry(id, nft)
    return nft
  }

  /**
   * Loads an NFT from the local filesystem (node.js only) using {@link loadNFTFromFilesystem}.
   *
   * Note: if opts.id is not set, the basename of the metadata json file will be used as the id,
   * which will only work if each NFT metadata file has a unique name.
   *
   * @param metadataFilePath path to metadata json file
   * @param imageFilePath optional path to image file. If not given, will be inferred using the logic in {@link loadNFTFromFilesystem}.
   * @param opts
   * @param opts.id an identifier for the NFT that will be used to create links from the bundle root directory object to the NFT data. Must be unique within the bundle. If not given, the name of the metadata json file (without '.json' extension) will be used.
   * @param opts.validateSchema if true, validate the metadata using a JSON schema before adding. off by default.
   * @param opts.gatewayHost override the default HTTP gateway to use in metadata links. Must include scheme, e.g. "https://dweb.link" instead of just "dweb.link". Default is "https://nftstorage.link".
   * @returns a Promise that resolves to a {@link PackagedNFT} containing the NFT data on success.
   */
  async addNFTFromFileSystem(
    metadataFilePath: string,
    imageFilePath?: string,
    opts: {
      id?: string
      validateSchema?: boolean
      gatewayHost?: string
    } = {}
  ): Promise<PackagedNFT> {
    this._enforceMaxEntries()

    let id = opts.id
    if (!id) {
      id = path.basename(metadataFilePath, '.json')
    }
    this._enforceMaxIdLength(id)

    const nft = await loadNFTFromFilesystem(metadataFilePath, imageFilePath, {
      ...opts,
      blockstore: this._blockstore,
    })
    this._addManifestEntry(id, nft)
    return nft
  }

  private _enforceMaxEntries() {
    if (Object.keys(this._nfts).length >= NFTBundle.MAX_ENTRIES) {
      throw new Error(
        `unable to add more than ${NFTBundle.MAX_ENTRIES} to a bundle.`
      )
    }
  }

  private _enforceMaxIdLength(id: string) {
    const len = new TextEncoder().encode(id).byteLength
    if (len > NFTBundle.MAX_ID_LEN) {
      throw new Error(
        `NFT id exceeds max length (${NFTBundle.MAX_ID_LEN} bytes): ${id}`
      )
    }
  }

  private _addManifestEntry(id: string, nft: PackagedNFT) {
    if (id in this._nfts) {
      throw new Error(
        `duplicate id in bundle: an entry with id "${id}" has already been added.`
      )
    }
    this._nfts[id] = nft
  }

  /**
   * @returns an object that links to each added NFT. Object keys are the `id` given when the NFT was added. Values are {@link PackagedNFT} objects.
   */
  manifest(): Record<string, PackagedNFT> {
    // make a copy of the manifest object, in case the caller wants to mutate
    return { ...this._nfts }
  }

  /**
   * Creates a root UnixFS directory object that links to each NFT and encodes it as an IPLD block.
   * @returns a Promise that resolves to an IPLD block of dab-pb / unixfs data.
   */
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

  /**
   * @returns the total size of all blocks in our blockstore. Will be slightly smaller than the size of the final CAR, due to the CAR header.
   */
  async getRawSize(): Promise<number> {
    let size = 0
    for await (const block of this._blockstore.blocks()) {
      size += block.bytes.byteLength
    }
    return size
  }

  /**
   * "Finalizes" the bundle by creating a root block linking to all the NFTs in the bundle and
   * generating a CAR containing all added NFT data.
   *
   * @returns a Promise that resolves to an {@link EncodedCar}, which contains a {@link CarReader} and the root object's CID.
   */
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
 * @returns a Promise that resolves to an encoded IPLD block of dag-pb/unixfs data.
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

/**
 * Given an array of dag-pb links, return an encoded IPLD block containing a unixfs directory object.
 * @param links an array of PBLink objects to the directory contents
 * @returns a Promise that resolves to an encoded IPLD block containing a directory entry
 */
async function makeDirectoryBlock(
  links: dagPb.PBLink[]
): Promise<Block.Block<dagPb.PBNode>> {
  const data = new UnixFS({ type: 'directory' }).marshal()
  const value = dagPb.createNode(data, links)
  return Block.encode({ value, codec: dagPb, hasher: sha256 })
}
