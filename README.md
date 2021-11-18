# metaplex-dotstorage-auth

This repo contains a client library for uploading data to [NFT.Storage](https://nft.storage) using a signature from a solana private key to authenticate the request.

See [SPEC.md](./spec.md) for details about the authentication scheme.

## Usage

```js
import { MetaplexAuthWithSecretKey, NFTStorageMetaplexor } from 'metaplex-dotstorage-auth'
import { getFilesFromPath } from 'files-from-path'

async function upload(filenames) {
  const key = await loadKeyFromSomewhere()
  const auth = MetaplexAuthWithSecretKey(key, 'mainnet-beta') // or 'devnet'
  const client = new NFTStorageMetaplexor({ auth })
  const files = await getFilesFromPath(filenames)

  console.log(`uploading ${files.length} files...`)
  const cid = await client.storeDirectory(files)

  console.log(cid)
  // => "bafy123..."
}
```

The `MetaplexAuthWithSecretKey` function returns an `AuthContext` that will authorize requests to NFT.Storage made with an `NFTStorageUploader`.

If you're using a [wallet adapter](https://github.com/solana-labs/wallet-adapter), you can use `MetaplexAuthWithSigner` instead.

