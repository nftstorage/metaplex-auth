import { describe, it, before } from 'mocha'
import { expect } from 'chai'
import nacl from 'tweetnacl'

import {
  MetaplexAuthWithSecretKey,
  makeMetaplexUploadToken,
  keyDID,
} from '../src/auth.js'

describe('MetaplexAuthWithSecretKey', () => {
  it('requires a mintingAgent option', () => {
    const kp = nacl.sign.keyPair()
    const fn = () =>
      // @ts-ignore
      MetaplexAuthWithSecretKey(kp.secretKey, { solanaCluster: 'devnet' })
    expect(fn).to.throw('mintingAgent')
  })
})

describe('makeMetaplexUploadToken', () => {
  let publicKey: Uint8Array
  let secretKey: Uint8Array

  before(() => {
    const kp = nacl.sign.keyPair()
    publicKey = kp.publicKey
    secretKey = kp.secretKey
  })

  it('creates a valid JWT token with a valid AuthContext', async () => {
    const auth = await MetaplexAuthWithSecretKey(secretKey, {
      mintingAgent: 'unit-tests',
      solanaCluster: 'devnet',
    })
    const cid = 'bafybeia7i25oibtrqmnb62lty4fegl5o7q7363rax52zvafgigx23og4fy'
    const token = await makeMetaplexUploadToken(auth, cid)
    expect(token).to.not.be.empty

    const tokenParts = token.split('.')
    expect(tokenParts.length).to.eq(3)

    const header = decodeJWTSegment(tokenParts[0]!)
    expect(header.alg).to.eq('EdDSA')
    expect(header.typ).to.eq('JWT')

    const payload = decodeJWTSegment(tokenParts[1]!)
    const expectedDID = keyDID(publicKey)
    expect(payload.iss).to.eq(expectedDID)
    expect(payload.req.put.rootCID).to.eq(cid)

    expect(payload.req.put.tags.chain).to.eq('solana')
    expect(payload.req.put.tags.solanaCluster).to.eq('devnet')

    const sig = Buffer.from(tokenParts[2]!, 'base64url')
    const msg = Buffer.from(tokenParts[0] + '.' + tokenParts[1], 'utf-8')
    const sigValid = nacl.sign.detached.verify(msg, sig, publicKey)
    expect(sigValid).to.be.true
  })
})

function decodeJWTSegment(s: string): any {
  const b = Buffer.from(s, 'base64url')
  return JSON.parse(b.toString('utf-8'))
}
