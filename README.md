# metaplex-auth

This repo contains a client library for uploading data to [NFT.Storage](https://nft.storage) using a signature from a solana private key to authenticate the request.

See [SPEC.md](https://github.com/nftstorage/metaplex-auth/blob/main/SPEC.md) for details about the authentication scheme.

## Install

```
npm install @nftstorage/metaplex-auth
```

or

```
yarn add @nftstorage/metaplex-auth
```

## Usage

This package is primarily intended to be used as a library in your JavaScript or TypeScript project.

```js
import { NFTStorageMetaplexor } from '@nftstorage/metaplex-auth'
import { getFilesFromPath } from 'files-from-path'

async function upload(filenames) {
  const key = await loadKeyFromSomewhere()
  const client = NFTStorageMetaplexor.withSecretKey(key, 'mainnet-beta') // or 'devnet'
  const files = await getFilesFromPath(filenames)

  console.log(`uploading ${files.length} files...`)
  const cid = await client.storeDirectory(files)

  console.log(cid)
  // => "bafy123..."
}
```

The `NFTStorageMetaplexor.withSecretKey` function returns an `NFTStorageMetaplexor` client object that will use the given secret key to authorize uploads to NFT.Storage

If you're using a [wallet adapter](https://github.com/solana-labs/wallet-adapter), you can use `NFTStorageMetaplexor.withSigner` instead.
