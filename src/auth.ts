import { base58btc } from 'multiformats/bases/base58'
import * as varint from 'varint'
import nacl from 'tweetnacl'

/**
 * Request tag indicating what blockchain will be used to mint. Currently, the value
 * will always be set to `"solana"` and cannot be overridden by the user.
 */
export const TagChain = 'chain'

/**
 * Request tag indicating which [Solana cluster](https://docs.solana.com/clusters) will be
 * used to mint.
 *
 * Currently this library will accept any string value, however it is strongly
 * recommended that you use one of these "canonical" values: `"devnet"`, `"mainnet-beta"`, `"testnet"`.
 * This may be enforced by the backend at a later date.
 */
export const TagSolanaCluster = 'solanaCluster'

/**
 * Request tag indicating which "user agent" or tool is being used to prepare the upload. This should be
 * set to a string that includes the name of the tool or platform.
 *
 * Projects using this library are free to choose their own value for this tag, however you should avoid
 * changing the name over time, unless the project itself changes names (for example, due to a community fork or re-branding).
 *
 * For personal projects or individuals creating tools that are not affiliated with a public platform, please set the
 * value to a URL for your code repository. If your code is not yet public, please create a repository containing a
 * description of the project and links to its public-facing interface.
 *
 * Examples of suitable values:
 *
 * - `"metaplex/candy-machine-cli"`
 * - `"metaplex/js-sdk"`
 * - `"magiceden/mint-authority"`
 * - `"https://github.com/samuelvanderwaal/metaboss"`
 *
 */
export const TagMintingAgent = 'mintingAgent'

/**
 * Optional request tag indicating which version of the "minting agent" was used to prepare the request.
 * This may contain arbitrary text, as each project may have their own versioning scheme.
 */
export const TagMintingAgentVersion = 'agentVersion'

const DEFAULT_CLUSTER = 'devnet'

const MulticodecEd25519Pubkey = varint.encode(0xed)

export type SolanaCluster = string

export interface AuthContext {
  chain: 'solana'

  solanaCluster: SolanaCluster

  mintingAgent: string

  agentVersion?: string

  signMessage: Signer

  publicKey: Uint8Array
}

export type Signer = (message: Uint8Array) => Promise<Uint8Array>

export interface RequestContext {
  message: RequestMessage
  messageBytes: Uint8Array
  mintDID: string
  signature: Uint8Array
}

export function MetaplexAuthWithSigner(
  signMessage: Signer,
  publicKey: Uint8Array,
  opts: {
    mintingAgent: string
    agentVersion?: string
    solanaCluster?: SolanaCluster
  }
): AuthContext {
  const chain = 'solana'
  const solanaCluster = opts.solanaCluster || DEFAULT_CLUSTER
  const { mintingAgent, agentVersion } = opts

  if (!mintingAgent) {
    throw new Error('required option "mintingAgent" not provided')
  }

  return {
    chain,
    solanaCluster,
    mintingAgent,
    agentVersion,
    signMessage,
    publicKey,
  }
}

export function MetaplexAuthWithSecretKey(
  privkey: Uint8Array,
  opts: {
    mintingAgent: string
    agentVersion?: string
    solanaCluster?: SolanaCluster
  }
): AuthContext {
  const { publicKey, secretKey } = nacl.sign.keyPair.fromSecretKey(privkey)
  const signMessage = async (message: Uint8Array) => {
    return nacl.sign.detached(message, secretKey)
  }

  return MetaplexAuthWithSigner(signMessage, publicKey, opts)
}

export async function makeMetaplexUploadToken(
  auth: AuthContext,
  rootCID: string
): Promise<string> {
  const tags = {
    [TagChain]: auth.chain,
    [TagSolanaCluster]: auth.solanaCluster,
    [TagMintingAgent]: auth.mintingAgent,
    [TagMintingAgentVersion]: auth.agentVersion,
  }
  const req = {
    put: {
      rootCID,
      tags,
    },
  }
  const iss = keyDID(auth.publicKey)
  const payload = {
    iss,
    req,
  }

  const headerB64 = objectToB64URL({ alg: 'EdDSA', typ: 'JWT' })
  const payloadB64 = objectToB64URL(payload)

  const encoded = headerB64 + '.' + payloadB64
  const encodedBytes = new TextEncoder().encode(encoded)
  const sig = await auth.signMessage(encodedBytes)
  const sigB64 = b64urlEncode(sig)
  const token = encoded + '.' + sigB64
  return token
}

export function keyDID(pubkey: Uint8Array): string {
  const keyWithCodec = new Uint8Array([...MulticodecEd25519Pubkey, ...pubkey])
  const mb = base58btc.encode(keyWithCodec)
  return `did:key:${mb}`
}

function objectToB64URL(o: object): string {
  const s = new TextEncoder().encode(JSON.stringify(o))
  return b64urlEncode(s)
}

function b64urlEncode(bytes: Uint8Array): string {
  const s = b64Encode(bytes)
  return s.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function b64Encode(bytes: Uint8Array): string {
  if (Buffer !== undefined) {
    return Buffer.from(bytes).toString('base64')
  }
  return btoa(String.fromCharCode.apply(null, [...bytes]))
}

// internal types

interface PutCarRequest {
  rootCID: string
  tags: Record<string, string>
}

interface RequestMessage {
  put?: PutCarRequest
}
