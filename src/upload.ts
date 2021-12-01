import { AuthContext, makeMetaplexUploadToken } from './auth'
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

  constructor({ auth, endpoint}: {auth: AuthContext, endpoint?: URL}) {
    this.auth = auth
    this.endpoint = endpoint || DEFAULT_ENDPOINT
  }

  static async storeDirectory(opts: { auth: AuthContext, endpoint?: URL }, files: Iterable<File>): Promise<CIDString> {
    this.#init()
    const { auth } = opts
    const baseEndpoint = opts.endpoint || DEFAULT_ENDPOINT

    // NFTStorage.storeCar adds `/upload` to the base endpoint url.
    // We want our request to go to `/metaplex/upload`, so we add the
    // `/metaplex/` prefix here.
    const endpoint = new URL('/metaplex/', baseEndpoint)

    const { car, cid } = await NFTStorage.encodeDirectory(files)
    const token = await makeMetaplexUploadToken(auth, cid.toString())
    return NFTStorage.storeCar({ endpoint, token }, car)
  }

  async storeDirectory(files: Iterable<File>): Promise<CIDString> {
    const { auth, endpoint } = this
    return NFTStorageMetaplexor.storeDirectory({ auth, endpoint }, files)
  }
}
