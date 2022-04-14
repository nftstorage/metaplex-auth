import {
  AuthContext,
  makeMetaplexUploadToken,
  Signer,
  MetaplexAuthWithSecretKey,
  MetaplexAuthWithSigner,
  SolanaCluster,
} from './auth.js'
import { CarReader, NFTStorage } from 'nft.storage'
import { PackagedNFT, loadNFTFromFilesystem } from './nft/index.js'
import { isBrowser } from './utils.js'
import type { CID } from 'multiformats'
import type { BlockDecoder } from 'multiformats/block'

/**
 * Options to pass through to NFTStorage.storeCar.
 */
interface CarStorerOptions {
  /**
   * Callback called after each chunk of data has been uploaded. By default,
   * data is split into chunks of around 10MB. It is passed the actual chunk
   * size in bytes.
   */
  onStoredChunk?: (size: number) => void
  /**
   * Maximum times to retry a failed upload. Default: 5
   */
  maxRetries?: number
  /**
   * Additional IPLD block decoders. Used to interpret the data in the CAR
   * file and split it into multiple chunks. Note these are only required if
   * the CAR file was not encoded using the default encoders: `dag-pb`,
   * `dag-cbor` and `raw`.
   */
  decoders?: BlockDecoder<any, any>[]
}

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

  /** The metadata that was stored with NFT.Storage, as a JS object */
  metadata: Record<string, any>
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
  private static _initialized: boolean
  auth: AuthContext
  endpoint: URL

  // Overrides the default NFTStorage.auth function to set
  // an 'x-web3auth' header instead of 'Authorization'.
  // Must be called before calling NFTStorage.storeCar
  private static init() {
    if (this._initialized) {
      return
    }
    // @ts-ignore
    NFTStorage.auth = (token: string) => ({
      'x-web3auth': `Metaplex ${token}`,
    })
    this._initialized = true
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
   * @param opts.mintingAgent - the "user agent" or tool used to prepare the upload. See {@link TagMintingAgent} for details.
   * @param opts.agentVersion - an optional version of the `mintingAgent`. See {@link TagMintingAgentVersion} for details.
   * @param opts.solanaCluster - the Solana cluster that the uploaded NFTs are to be minted on. defaults to 'devnet' if not provided.
   * @param opts.endpoint - the URL of the NFT.Storage API. defaults to 'https://api.nft.storage' if not provided.
   * @returns
   */
  static withSecretKey(
    key: Uint8Array,
    opts: {
      mintingAgent: string
      agentVersion?: string
      solanaCluster?: SolanaCluster
      endpoint?: URL
    }
  ) {
    const { solanaCluster, mintingAgent, agentVersion, endpoint } = opts
    const auth = MetaplexAuthWithSecretKey(key, {
      solanaCluster,
      mintingAgent,
      agentVersion,
    })
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
   * @param opts.mintingAgent - the "user agent" or tool used to prepare the upload. See {@link TagMintingAgent} for details.
   * @param opts.agentVersion - an optional version of the `mintingAgent`. See {@link TagMintingAgentVersion} for details.
   * @param opts.solanaCluster - the Solana cluster that the uploaded NFTs are to be minted on. defaults to 'devnet' if not provided.
   * @param opts.endpoint - the URL of the NFT.Storage API. defaults to 'https://api.nft.storage' if not provided.
   * @returns
   */
  static withSigner(
    signMessage: Signer,
    publicKey: Uint8Array,
    opts: {
      mintingAgent: string
      agentVersion?: string
      solanaCluster?: SolanaCluster
      endpoint?: URL
    }
  ) {
    const { solanaCluster, mintingAgent, agentVersion, endpoint } = opts
    const auth = MetaplexAuthWithSigner(signMessage, publicKey, {
      solanaCluster,
      mintingAgent,
      agentVersion,
    })
    return new NFTStorageMetaplexor({ auth, endpoint })
  }

  /**
   * Stores a single Blob (or File) with NFT.Storage, without wrapping in a directory listing.
   * If a File is provided, any filenames will be ignored and will not be preserved on IPFS.
   *
   * @param context information required to authenticate uploads
   * @param blob a Blob or File object to store
   * @returns CID string for the stored content
   */
  static async storeBlob(
    context: ServiceContext,
    blob: Blob
  ): Promise<CIDString> {
    this.init()
    const { cid, car } = await NFTStorage.encodeBlob(blob)
    return this.storeCar(context, cid, car)
  }

  /**
   * Stores one or more files with NFT.Storage, bundling them into an IPFS directory.
   *
   * If the `files` contain directory paths in their `name`s, they MUST all share the same
   * parent directory. E.g. 'foo/hello.txt' and 'foo/thing.json' is fine,
   * but 'foo/hello.txt' and 'bar/thing.json' will fail.
   *
   * @param context information required to authenticate uploads
   * @param files an iterable of File objects to be uploaded
   * @returns CID string of the IPFS directory containing all uploaded files.
   */
  static async storeDirectory(
    context: ServiceContext,
    files: Iterable<File>
  ): Promise<CIDString> {
    this.init()
    const { cid, car } = await NFTStorage.encodeDirectory(files)
    return this.storeCar(context, cid, car)
  }

  /**
   * Stores a Content Archive (CAR) containing content addressed data.
   *
   * @param context information required to authenticate uploads
   * @param cid the root CID of the CAR.
   * @param car a CarReader that supplies CAR data. Must have a single root CID that matches the `cid` param.
   * @param opts options to pass through to NFTStorage.storeCar
   * @returns a Promise that resolves to the uploaded CID, as a CIDv1 string.
   */
  static async storeCar(
    context: ServiceContext,
    cid: CID,
    car: CarReader,
    opts?: CarStorerOptions
  ) {
    this.init()
    const { auth } = context
    const baseEndpoint = context.endpoint || DEFAULT_ENDPOINT

    // NFTStorage.storeCar adds `/upload` to the base endpoint url.
    // We want our request to go to `/metaplex/upload`, so we add the
    // `/metaplex/` prefix here.
    const endpoint = new URL('/metaplex/', baseEndpoint)
    const token = await makeMetaplexUploadToken(auth, cid.toString())
    return NFTStorage.storeCar({ endpoint, token }, car, opts)
  }

  /**
   * Stores a {@link PackagedNFT} object with NFT.Storage.
   *
   * Uploads the CARs contained in the PackagedNFT object and returns an
   * object containing the root CID of each CAR and URLs to the uploaded
   * NFT metadata.
   *
   * See {@link prepareMetaplexNFT} for creating PackagedNFT instances from
   * File objects, or {@link loadNFTFromFilesystem} for loading from disk (node.js only).
   *
   * @param context information required to authenticate uploads
   * @param nft a {@link PackagedNFT} object containing NFT assets and metadata
   * @param opts options to pass through to NFTStorage.storeCar
   * @returns a {@link StoreNFTResult} object containing the CIDs and URLs for the stored NFT
   */
  static async storePreparedNFT(
    context: ServiceContext,
    nft: PackagedNFT,
    opts?: CarStorerOptions
  ): Promise<StoreNFTResult> {
    this.init()

    const metadataRootCID = await this.storeCar(
      context,
      nft.encodedMetadata.cid,
      nft.encodedMetadata.car,
      opts
    )
    const assetRootCID = await this.storeCar(
      context,
      nft.encodedAssets.cid,
      nft.encodedAssets.car,
      opts
    )
    const { metadataGatewayURL, metadataURI } = nft

    return {
      metadataRootCID,
      assetRootCID,
      metadataGatewayURL,
      metadataURI,
      metadata: nft.metadata,
    }
  }

  /**
   * Loads an NFT from disk and stores it with NFT.Storage. Node.js only!
   *
   * Uses {@link loadNFTFromFilesystem} to load NFT data and stores with
   * {@link storePreparedNFT}.
   *
   * @param context information required to authenticate uploads
   * @param metadataFilePath path to metadata.json file
   * @param imageFilePath optional path to image file. If not provided, the image will be located using the heuristics described in {@link loadNFTFromFilesystem}.
   * @param opts
   * @param opts.validateSchema if true, validate the metadata against a JSON schema before processing. off by default
   * @param opts.gatewayHost the hostname of an IPFS HTTP gateway to use in metadata links. Defaults to "nftstorage.link" if not set.
   * @param opts.storeCarOptions options to pass through to NFTStorage.storeCar
   * @returns a {@link StoreNFTResult} object containing the CIDs and URLs for the stored NFT
   */
  static async storeNFTFromFilesystem(
    context: ServiceContext,
    metadataFilePath: string,
    imageFilePath?: string,
    opts: {
      gatewayHost?: string
      validateSchema?: boolean
      storeCarOptions?: CarStorerOptions
    } = {}
  ): Promise<StoreNFTResult> {
    if (isBrowser) {
      throw new Error(`storeNFTFromFilesystem is only available on node.js`)
    }

    const nft = await loadNFTFromFilesystem(
      metadataFilePath,
      imageFilePath,
      opts
    )
    return this.storePreparedNFT(context, nft, opts.storeCarOptions)
  }

  // -- instance methods are just "sugar" around the static methods, using `this` as the ServiceContext parameter

  /**
   * Stores a single Blob (or File) with NFT.Storage, without wrapping in a directory listing.
   * If a File is provided, any filenames will be ignored and will not be preserved on IPFS.
   *
   * @param blob a Blob or File object to store
   * @returns CID string for the stored content
   */
  async storeBlob(blob: Blob): Promise<CIDString> {
    const { cid, car } = await NFTStorage.encodeBlob(blob)
    return NFTStorageMetaplexor.storeCar(this, cid, car)
  }

  /**
   * Stores a Content Archive (CAR) containing content addressed data.
   *
   * @param cid the root CID of the CAR.
   * @param car a CarReader that supplies CAR data. Must have a single root CID that matches the `cid` param.
   * @param opts options to pass through to NFTStorage.storeCar
   * @returns a Promise that resolves to the uploaded CID, as a CIDv1 string.
   */
  async storeCar(cid: CID, car: CarReader, opts?: CarStorerOptions) {
    return NFTStorageMetaplexor.storeCar(this, cid, car, opts)
  }

  /**
   * Stores one or more files with NFT.Storage, bundling them into an IPFS directory.
   *
   * If the `files` contain directory paths in their `name`s, they MUST all share the same
   * parent directory. E.g. 'foo/hello.txt' and 'foo/thing.json' is fine,
   * but 'foo/hello.txt' and 'bar/thing.json' will fail.
   *
   * @param files an iterable of File objects to be uploaded
   * @returns CID string of the IPFS directory containing all uploaded files.
   */
  async storeDirectory(files: Iterable<File>): Promise<CIDString> {
    return NFTStorageMetaplexor.storeDirectory(this, files)
  }

  /**
   * Stores a {@link PackagedNFT} object with NFT.Storage.
   *
   * Uploads the CARs contained in the PackagedNFT object and returns an
   * object containing the root CID of each CAR and URLs to the uploaded
   * NFT metadata.
   *
   * See {@link prepareMetaplexNFT} for creating PackagedNFT instances from
   * File objects, or {@link loadNFTFromFilesystem} for loading from disk (node.js only).
   *
   * @param nft a {@link PackagedNFT} object containing NFT assets and metadata
   * @param opts options to pass through to NFTStorage.storeCar
   * @returns a {@link StoreNFTResult} object containing the CIDs and URLs for the stored NFT
   */
  async storePreparedNFT(
    nft: PackagedNFT,
    opts?: CarStorerOptions
  ): Promise<StoreNFTResult> {
    return NFTStorageMetaplexor.storePreparedNFT(this, nft, opts)
  }

  /**
   * Loads an NFT from disk and stores it with NFT.Storage. Node.js only!
   *
   * Uses {@link loadNFTFromFilesystem} to load NFT data and stores with
   * {@link storePreparedNFT}.
   *
   * @param metadataFilePath path to metadata.json file
   * @param imageFilePath optional path to image file. If not provided, the image will be located using the heuristics described in {@link loadNFTFromFilesystem}.
   * @param opts
   * @param opts.validateSchema if true, validate the metadata against a JSON schema before processing. off by default
   * @param opts.gatewayHost the hostname of an IPFS HTTP gateway to use in metadata links. Defaults to "nftstorage.link" if not set.
   * @param opts.storeCarOptions options to pass through to NFTStorage.storeCar
   * @returns a {@link StoreNFTResult} object containing the CIDs and URLs for the stored NFT
   */
  async storeNFTFromFilesystem(
    metadataFilePath: string,
    imageFilePath?: string,
    opts: {
      gatewayHost?: string
      validateSchema?: boolean
      storeCarOptions?: CarStorerOptions
    } = {}
  ): Promise<StoreNFTResult> {
    return NFTStorageMetaplexor.storeNFTFromFilesystem(
      this,
      metadataFilePath,
      imageFilePath,
      opts
    )
  }
}
