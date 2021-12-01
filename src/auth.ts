import { base58btc } from 'multiformats/bases/base58'
import * as varint from 'varint'
import nacl from 'tweetnacl'

const TagChain = "chain"
const TagSolanaCluster = "solana-cluster"

const MulticodecEd25519Pubkey = varint.encode(0xed)

export type SolanaCluster = string

export interface AuthContext {
  chain: 'solana'

  solanaCluster: SolanaCluster

  signMessage: Signer

  publicKey: Uint8Array
}

export interface UploadCredentials {
  token: string
  meta: Record<string, any>
}

export type Signer = (message: Uint8Array) => Promise<Uint8Array>

export interface RequestContext {
  message: RequestMessage
  messageBytes: Uint8Array
  mintDID: string
  signature: Uint8Array
}

export function MetaplexAuthWithSigner(signMessage: Signer, publicKey: Uint8Array, solanaCluster: SolanaCluster = 'devnet'): AuthContext {
  const chain = 'solana'
  return {
    chain,
    solanaCluster,
    signMessage,
    publicKey
  }
}

export function MetaplexAuthWithSecretKey(privkey: Uint8Array, solanaCluster: SolanaCluster = 'devnet'): AuthContext {
  const { publicKey, secretKey } = nacl.sign.keyPair.fromSecretKey(privkey)
  const signMessage = async (message: Uint8Array) => {
    return nacl.sign.detached(message, secretKey)
  }

  return MetaplexAuthWithSigner(signMessage, publicKey, solanaCluster)
}

export async function makeMetaplexUploadToken(auth: AuthContext, rootCID: string): Promise<string> {
  const tags = {
    [TagChain]: auth.chain,
    [TagSolanaCluster]: auth.solanaCluster
  }
  const req = {
    put: {
      rootCID,
      tags,
    }
  }
  const iss = keyDID(auth.publicKey)
  const payload = {
    iss,
    req
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
  return s.replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
}

function b64Encode(bytes: Uint8Array): string {
  if (Buffer !== undefined) {
    return Buffer.from(bytes).toString('base64')
  }
  return btoa(String.fromCharCode.apply(null, [...bytes]))
}

// internal types

interface PutCarRequest {
  rootCID: string,
  tags: Record<string, string>,
}

interface RequestMessage {
  put?: PutCarRequest
}

