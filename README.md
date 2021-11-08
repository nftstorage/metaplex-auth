# metaplex-dotstorage-auth

This repo contains a client library for uploading data to [NFT.Storage](https://nft.storage) using a signature from a solana private key to authenticate the request.

## Usage

```js
import { MetaplexAuthWithSecretKey, NFTStorageUploader } from 'metaplex-dotstorage-auth'
import { getFilesFromPath } from 'files-from-path'

async function upload(filenames) {
  const key = await loadKeyFromSomewhere()
  const auth = MetaplexAuthWithSecretKey(key, 'mainnet-beta') // or 'devnet'
  const uploader = NFTStorageUploader(auth)

  const files = await getFilesFromPath(filenames)

  console.log(`uploading ${files.length} files...`)
  const result = await uploader.uploadFiles(files, {
    onStoredChunk: (size) => console.log(`uploaded chunk of ${size} bytes`)
  })

  console.log(result)
  // {
  //   "rootCID": "bafy123...",
  //   "filenames": [
  //     "file1.json"
  //     "file2.png"
  //   ]
  // }
}
```

The `MetaplexAuthWithSecretKey` function returns an `AuthContext` that will authorize requests to NFT.Storage made with an `NFTStorageUploader`.

If you're using a [wallet adapter](https://github.com/solana-labs/wallet-adapter), you can use `MetaplexAuthWithSigner` instead.

