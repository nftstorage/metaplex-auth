import { AuthContext, makeMetaplexUploadToken, Signer, MetaplexAuthWithSecretKey, MetaplexAuthWithSigner, SolanaCluster } from './auth'
import { NFTStorage } from 'nft.storage'

const DEFAULT_ENDPOINT = new URL('https://api.nft.storage')

type CIDString = string

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
      'x-web3auth': `Metaplex ${token}`
    })
    this.#initialized = true
  }

  constructor({ auth, endpoint }: { auth: AuthContext, endpoint?: URL }) {
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
  static withSecretKey(key: Uint8Array, opts: { solanaCluster?: SolanaCluster, endpoint?: URL } = {}) {
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
  static withSigner(signMessage: Signer, publicKey: Uint8Array, opts: { solanaCluster?: SolanaCluster, endpoint?: URL } = {}) {
    const { solanaCluster, endpoint } = opts
    const auth = MetaplexAuthWithSigner(signMessage, publicKey, solanaCluster)
    return new NFTStorageMetaplexor({ auth, endpoint })
  }

  static async storeDirectory(opts: { auth: AuthContext, endpoint?: URL }, files: Iterable<File>): Promise<CIDString> {
    this.#init()
    const { auth } = opts
    const baseEndpoint = opts.endpoint || DEFAULT_ENDPOINT

    // NFTStorage.storeCar adds `/upload` to the base endpoint url.
    // We want our request to go to `/metaplex/upload`, so we add the
    // `metaplex` prefix here.
    const endpoint = new URL('/metaplex', baseEndpoint)

    const { car, cid } = await NFTStorage.encodeDirectory(files)
    const token = await makeMetaplexUploadToken(auth, cid.toString())
    return NFTStorage.storeCar({ endpoint, token }, car)
  }

  async storeDirectory(files: Iterable<File>): Promise<CIDString> {
    const { auth, endpoint } = this
    return NFTStorageMetaplexor.storeDirectory({ auth, endpoint }, files)
  }
}