import {
  AuthContext,
  makeMetaplexUploadToken,
  Signer,
  MetaplexAuthWithSecretKey,
  MetaplexAuthWithSigner,
  SolanaCluster,
} from './auth'
import { CarReader, NFTStorage } from 'nft.storage'
import { PackagedNFT, loadNFTFromFilesystem } from './nft'
import { isBrowser } from './utils'
import type { CID } from 'multiformats'

const DEFAULT_ENDPOINT = new URL('https://api.nft.storage')

/** An IPFS Content Identifier (CID) in string form */
type CIDString = string

/**
 * Information required to reach the NFT.Storage service and prepare upload tokens.
 */
export type ServiceContext = { auth: AuthContext; endpoint?: URL }

/**
 * Return value of a successful call to {@link NFTStorageMetaplexor.storePreparedNFT} or
 * {@link NFTStorageMetaplexor.storeNFTFromFilesystem}.
 */
export interface StoreNFTResult {
  /** CID of the IPFS directory containing the metadata.json file for the NFT */
  metadataRootCID: CIDString

  /** CID of the IPFS directory containing all assets bundled with the NFT (including main image) */
  assetRootCID: CIDString

  /** IPFS HTTP gateway URL to the metadata json file */
  metadataGatewayURL: string

  /** ipfs:// URI for metadata json file */
  metadataURI: string
}

/**
 * A bespoke client for [NFT.Storage](https://nft.storage) that uses Solana private keys
 * to authenticate uploads of NFT assets and metadata for Metaplex NFT creators.
 *
 * This client uses a metaplex-specific endpoint (https://api.nft.storage/metaplex/upload)
 * that requires a request-specific JWT token. See SPEC.md in this repo for more details.
 *
 */
export class NFTStorageMetaplexor {
  static #initialized: boolean
  auth: AuthContext
  endpoint: URL

  // Overrides the default NFTStorage.auth function to set
  // an 'x-web3auth' header instead of 'Authorization'.
  // Must be called before calling NFTStorage.storeCar
  static #init() {
    if (this.#initialized) {
      return
    }
    // @ts-ignore
    NFTStorage.auth = (token: string) => ({
      'x-web3auth': `Metaplex ${token}`,
    })
    this.#initialized = true
  }

  constructor({ auth, endpoint }: ServiceContext) {
    this.auth = auth
    this.endpoint = endpoint || DEFAULT_ENDPOINT
  }

  /**
   * Creates a new instance of NFTStorageMetaplexor using the given secret signing key.
   *
   * @param key - an Ed25519 private key
   * @param opts
   * @param opts.solanaCluster - the Solana cluster that the uploaded NFTs are to be minted on. defaults to 'devnet' if not provided.
   * @param opts.endpoint - the URL of the NFT.Storage API. defaults to 'https://api.nft.storage' if not provided.
   * @returns
   */
  static withSecretKey(
    key: Uint8Array,
    opts: { solanaCluster?: SolanaCluster; endpoint?: URL } = {}
  ) {
    const { solanaCluster, endpoint } = opts
    const auth = MetaplexAuthWithSecretKey(key, solanaCluster)
    return new NFTStorageMetaplexor({ auth, endpoint })
  }

  /**
   * Creates a new instance of NFTStorageMetaplexor using the given `Signer`, which is a function that accepts a
   * `Uint8Array` to be signed and returns a `Promise<Uint8Array>` containing the signature. The `Signer` type is
   * compatible with the `signMessage` method of
   * [Solana wallet adapters](https://github.com/solana-labs/wallet-adapter) that support signing arbitrary
   * messages.
   *
   * @param signMessage - a function that asynchronously returns a signature of an input message
   * @param publicKey - the public key that can validate signatures produced by the signer
   * @param opts
   * @param opts.solanaCluster - the Solana cluster that the uploaded NFTs are to be minted on. defaults to 'devnet' if not provided.
   * @param opts.endpoint - the URL of the NFT.Storage API. defaults to 'https://api.nft.storage' if not provided.
   * @returns
   */
  static withSigner(
    signMessage: Signer,
    publicKey: Uint8Array,
    opts: { solanaCluster?: SolanaCluster; endpoint?: URL } = {}
  ) {
    const { solanaCluster, endpoint } = opts
    const auth = MetaplexAuthWithSigner(signMessage, publicKey, solanaCluster)
    return new NFTStorageMetaplexor({ auth, endpoint })
  }

  /**
   * Stores one or more files with NFT.Storage, bundling them into an IPFS directory.
   *
   * If the `files` contain directory paths in their `name`s, they MUST all share the same
   * parent directory. E.g. 'foo/hello.txt' and 'foo/thing.json' is fine,
   * but 'foo/hello.txt' and 'bar/thing.json' will fail.
   *
   * @param context
   * @param files
   * @returns CID string of the IPFS directory containing all uploaded files.
   */
  static async storeDirectory(
    context: ServiceContext,
    files: Iterable<File>
  ): Promise<CIDString> {
    this.#init()
    const { cid, car } = await NFTStorage.encodeDirectory(files)
    return this.storeCar(context, cid, car)
  }

  static async storeCar(context: ServiceContext, cid: CID, car: CarReader) {
    this.#init()
    const { auth } = context
    const baseEndpoint = context.endpoint || DEFAULT_ENDPOINT

    // NFTStorage.storeCar adds `/upload` to the base endpoint url.
    // We want our request to go to `/metaplex/upload`, so we add the
    // `/metaplex/` prefix here.
    const endpoint = new URL('/metaplex/', baseEndpoint)
    const token = await makeMetaplexUploadToken(auth, cid.toString())
    return NFTStorage.storeCar({ endpoint, token }, car)
  }

  static async storePreparedNFT(
    context: ServiceContext,
    nft: PackagedNFT
  ): Promise<StoreNFTResult> {
    this.#init()

    const metadataRootCID = await this.storeCar(
      context,
      nft.encodedMetadata.cid,
      nft.encodedMetadata.car
    )
    const assetRootCID = await this.storeCar(
      context,
      nft.encodedAssets.cid,
      nft.encodedAssets.car
    )
    const { metadataGatewayURL, metadataURI } = nft

    return {
      metadataRootCID,
      assetRootCID,
      metadataGatewayURL,
      metadataURI,
    }
  }

  static async storeNFTFromFilesystem(
    context: ServiceContext,
    metadataFilePath: string,
    imageFilePath?: string
  ): Promise<StoreNFTResult> {
    if (isBrowser) {
      throw new Error(`storeNFTFromFilesystem is only available on node.js`)
    }

    const nft = await loadNFTFromFilesystem(metadataFilePath, imageFilePath)
    return this.storePreparedNFT(context, nft)
  }

  // -- instance methods are just "sugar" around the static methods, using `this` as the ServiceContext parameter

  async storeCar(cid: CID, car: CarReader) {
    return NFTStorageMetaplexor.storeCar(this, cid, car)
  }

  async storeDirectory(files: Iterable<File>): Promise<CIDString> {
    return NFTStorageMetaplexor.storeDirectory(this, files)
  }

  async storePreparedNFT(nft: PackagedNFT): Promise<StoreNFTResult> {
    return NFTStorageMetaplexor.storePreparedNFT(this, nft)
  }

  async storeNFTFromFilesystem(
    metadataFilePath: string,
    imageFilePath?: string
  ): Promise<StoreNFTResult> {
    return NFTStorageMetaplexor.storeNFTFromFilesystem(
      this,
      metadataFilePath,
      imageFilePath
    )
  }
}
