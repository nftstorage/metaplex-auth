import path from 'path'
import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { describe, it, before } from 'mocha'
import { expect } from 'chai'
import nacl from 'tweetnacl'
import { CID } from 'multiformats'
import { CarIndexedReader } from '@ipld/car'
import { getFilesFromPath } from 'files-from-path'
import { NFTStorageMetaplexor } from '../src/upload.js'
import { Blob } from '../src/platform.js'
import type { AuthContext } from '../src/auth.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

describe('NFTStorageMetaplexor', () => {
  const { SERVICE_ENDPOINT } = process.env
  const endpoint = new URL(SERVICE_ENDPOINT || '')

  let secretKey: Uint8Array
  let publicKey: Uint8Array

  before(() => {
    const kp = nacl.sign.keyPair()
    secretKey = kp.secretKey
    publicKey = kp.publicKey
  })

  describe('withSecretKey', () => {
    it('creates an instance with an AuthContext backed by the given key', async () => {
      const client = NFTStorageMetaplexor.withSecretKey(secretKey, {
        mintingAgent: 'unit-tests',
      })
      expect(client.auth.publicKey).to.deep.eq(publicKey)

      const { msg, sig } = await signRandomMessage(client.auth)
      const valid = nacl.sign.detached.verify(msg, sig, publicKey)
      expect(valid, 'AuthContext created invalid signature for public key')
    })
  })

  describe('withSigner', () => {
    it('creates an instance with an AuthContext backed by the given signMessage function', async () => {
      const signMessage = async (msg: Uint8Array) =>
        nacl.sign.detached(msg, secretKey)

      const client = NFTStorageMetaplexor.withSigner(signMessage, publicKey, {
        mintingAgent: 'unit-tests',
      })
      expect(client.auth.publicKey).to.deep.eq(publicKey)

      const { msg, sig } = await signRandomMessage(client.auth)
      const valid = nacl.sign.detached.verify(msg, sig, publicKey)
      expect(valid, 'AuthContext created invalid signature for public key')
    })
  })

  describe('storeBlob', () => {
    it('posts a CAR to /metaplex/upload', async () => {
      const client = NFTStorageMetaplexor.withSecretKey(secretKey, {
        endpoint,
        mintingAgent: 'unit-tests',
      })
      const blob = new Blob(['hello world'])
      const cid = await client.storeBlob(blob)
      expect(cid).to.not.be.empty
    })
  })

  describe('storeDirectory', () => {
    it('posts a CAR to /metaplex/upload', async () => {
      const client = NFTStorageMetaplexor.withSecretKey(secretKey, {
        endpoint,
        mintingAgent: 'unit-tests',
      })
      const dir = path.join(__dirname, 'fixtures', 'nfts', '01-simple-example')
      const files = await getFilesFromPath(dir)
      // @ts-ignore getFilesFromPath returns a different File object type. TODO: fix type def on storeDirectory to be more permissive
      const cid = await client.storeDirectory(files)
      expect(cid).to.not.be.empty
    })
  })

  describe('storeCar', () => {
    it('posts a CAR to /metaplex/upload', async () => {
      const client = NFTStorageMetaplexor.withSecretKey(secretKey, {
        endpoint,
        mintingAgent: 'unit-tests',
      })
      const dir = path.join(__dirname, 'fixtures', 'cars')
      const filenames = await fs.readdir(dir)
      for (const f of filenames) {
        const car = await CarIndexedReader.fromFile(path.join(dir, f))
        const cidString = path.basename(f, '.car')
        const resultCid = await client.storeCar(CID.parse(cidString), car)
        await car.close()
        expect(resultCid).to.eq(cidString)
      }
    })
  })

  describe('storeNFTFromFilesystem', () => {
    it('loads an NFT from disk and posts two CARs to /metaplex/upload', async () => {
      const client = NFTStorageMetaplexor.withSecretKey(secretKey, {
        endpoint,
        mintingAgent: 'unit-tests',
      })
      const metadataPath = path.join(
        __dirname,
        'fixtures',
        'nfts',
        '01-simple-example',
        'token.json'
      )
      const result = await client.storeNFTFromFilesystem(metadataPath)
      expect(result.assetRootCID).to.not.be.empty
      expect(result.metadataRootCID).to.not.be.empty
      expect(result.metadata['image']).to.eq(
        `https://nftstorage.link/ipfs/${result.assetRootCID}/token.png`
      )
    })
  })
})

async function signRandomMessage(
  auth: AuthContext
): Promise<{ msg: Uint8Array; sig: Uint8Array }> {
  const msg = nacl.randomBytes(128)
  const sig = await auth.signMessage(msg)
  return { msg, sig }
}
