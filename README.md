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

API reference docs can be found at https://nftstorage.github.io/metaplex-auth/

### Creating a client

The main entry point into the API is the [NFTStorageMetaplexor class](https://nftstorage.github.io/metaplex-auth/classes/NFTStorageMetaplexor.html), which provides methods for uploading files to NFT.Storage.

To create an `NFTStorageMetaplexor`, you'll need either a Solana private signing key or a `signMessage` function that can return a valid Ed25519 signature for a Solana account (for example, from a [wallet adapter](https://github.com/solana-labs/wallet-adapter)).

The methods for creating an `NFTStorageMetaplexor` also require a `mintingAgent` string.

The `mintingAgent` should identify the tool or platform used to prepare the upload.

Projects using this library are free to choose their own value for this tag, however you should avoid changing the name over time, unless the project itself changes names (for example, due to a community fork or re-branding).

For personal projects or individuals creating tools that are not affiliated with a public platform, please set the value to a URL for your code repository. If your code is not yet public, please create a repository containing a description of the project and links to its public-facing interface.

Examples of suitable values:

- `"metaplex/candy-machine-cli"`
- `"metaplex/js-sdk"`
- `"magiceden/mint-authority"`
- `"https://github.com/samuelvanderwaal/metaboss"`

You may also optionally pass an `agentVersion` string, to differentiate between different versions of your project.

#### With secret key

The [`NFTStorageMetaplexor.withSecretKey` static method](https://nftstorage.github.io/metaplex-auth/classes/NFTStorageMetaplexor.html#withSecretKey) accepts a `Uint8Array` containing a secret Ed25519 signing key.

It also optionally accepts an options object that can be used to set some metadata about the request. Most importantly, you should set the `solanaCluster` option to the cluster you intend to mint on. If not provided, it will default to `devnet`.

```js
import { NFTStorageMetaplexor } from '@nftstorage/metaplex-auth'

const key = loadKeyFromSomewhere()
const client = NFTStorageMetaplexor.withSecretKey(key, {
  solanaCluster: 'mainnet-beta',
  mintingAgent: 'my-awesome-tool',
})
```

#### With wallet adapter

If you're using a [wallet adapter](https://github.com/solana-labs/wallet-adapter) that supports the `signMessage` function, you can use it with the [`NFTStorageMetaplexor.withSigner` static method](https://nftstorage.github.io/metaplex-auth/classes/NFTStorageMetaplexor.html#withSigner) by passing in the `signMessage` function and the public key.

```js
import { NFTStorageMetaplexor } from '@nftstorage/metaplex-auth'
import { useWallet } from '@solana/wallet-adapter-react'

const MyComponent = () => {
  const { publicKey, signMessage } = useWallet()
  const client = NFTStorageMetaplexor.withSigner(signMessage, publicKey, {
    solanaCluster: 'mainnet-beta',
    mintingAgent: 'my-awesome-tool',
  })
}
```

### Uploading Metaplex NFTs

To assist with uploading Metaplex NFTs, this package includes support for loading [Metaplex NFT metadata](https://docs.metaplex.com/nft-standard) and uploading files that are referenced within.

The `storeNFT` methods will validate the metadata using a JSON schema to catch any formatting errors before upload.

**Please note** that the schema validation code has not been widely tested yet on real-world NFT data and may be too restrictive. If you believe that it is rejecting valid metadata, please [open an issue](https://github.com/nftstorage/metaplex-auth/issues/new).

If you're using node.js, you can use the [NFTStorageMetaplexor.storeNFTFromFilesystem method](https://nftstorage.github.io/metaplex-auth/classes/NFTStorageMetaplexor.html#storeNFTFromFilesystem) to load NFT data from disk and upload it in one operation.

```js
async function uploadNFT(pathToMetadataJson) {
  const key = loadKeyFromSomewhere()
  const client = NFTStorageMetaplexor.withSecretKey(key)

  const result = await client.storeNFTFromFilesystem(pathToMetadataJson)
}
```

If you're running in a browser, you'll need to use the [`prepareMetaplexNFT` function](https://nftstorage.github.io/metaplex-auth/modules.html#prepareMetaplexNFT), which accepts metadata as a JS object and takes `File` objects containing image and other asset data. The resulting [`PackagedNFT` object](https://nftstorage.github.io/metaplex-auth/interfaces/PackagedNFT.html) can be passed into the [storePreparedNFT method](https://nftstorage.github.io/metaplex-auth/classes/NFTStorageMetaplexor.html#storePreparedNFT).

#### File references

The `prepareMetaplexNFT` and `storeNFTFromFilesystem` methods will upload the `image`, `animation_url` and any files contained in `properties.files` if they contain valid file references.

In the case of `prepareMetaplexNFT`, the provided `imageFile` parameter will be uploaded, along with any `additionalAssetFiles`. The `image` field in the metadata will be replaced with an HTTP gateway URL to the uploaded image. Likewise, if the `animation_url` field contains the name of one of the `additionalAssetFiles`, the field will be replaced with a gateway URL.

All entries in `properties.files` will likewise be replaced with IPFS links if the `uri` field contains the filename of any of the uploaded files. Each uploaded file will contain _two_ entries in the final metadata: one containing an HTTP gateway URL with the `cdn` flag set to `true`, and one location-independent `ipfs://` URI with `cdn` set to `false`. This should allow clients to fetch content over HTTP while still preserving a location-independent link that doesn't depend on a single gateway.

When using `storeNFTFromFilesystem` on node.js, the same rules apply, however you don't need to pass in `File` objects for each asset. Instead, you can set the `image` field (and optionally, `animation_url`) to a file path relative to the metadata JSON file, and the image data will be loaded from disk. Likewise, any entries in `properties.files` whose `uri` contains a valid file path will be uploaded, and the entry will be replaced with two IPFS links as with `prepareMetaplexNFT`.

### Uploading files

You can upload arbitrary files using the [storeDirectory method](https://nftstorage.github.io/metaplex-auth/classes/NFTStorageMetaplexor.html#storeDirectory). It accepts an `Iterable` of `File` objects and bundles them into an IPFS directory listing, returning the root CID of the stored directory.

```js
async function uploadFiles(files) {
  const key = loadKeyFromSomewhere()
  const client = NFTStorageMetaplexor.withSecretKey(key)

  const cid = await client.storeDirectory(files)
  console.log(
    `Stored ${files.length} file(s). Check them out at https://${cid}.ipfs.nftstorage.link`
  )
}
```

Note that the returned CID links to a directory object containing the files. If you want to link to individual files within the directory, you must append the filename to the result:

```js
async function uploadFiles(files) {
  const key = loadKeyFromSomewhere()
  const client = NFTStorageMetaplexor.withSecretKey(key)

  const cid = await client.storeDirectory(files)

  // make HTTP gateway links using the nftstorage.link gateway
  const gatewayBaseUrl = new URL(`https://${cid}.ipfs.nftstorage.link`)
  const gatewayLinks = files.map((f) => new URL(f.name, gatewayBaseUrl))

  // make gateway-agnostic IPFS uris:
  const uriBase = new URL(`ipfs://${cid}`)
  const ipfsURIs = files.map((f) => new URL(f.name, uriBase))
}
```

### Uploading CAR files

Under the hood, all the upload methods encode data into IPFS Content Archives (CARs) before uploading.

If you already have CAR-formatted data, you can upload it with the [storeCar method](https://nftstorage.github.io/metaplex-auth/classes/NFTStorageMetaplexor.html#storeCar).

This may be useful if you have already imported your data into IPFS, or if you want to have more control over the object graph, for example, because you want to use [IPLD](https://ipld.io) to store structured data.

The `storeCar` method accepts a `CarReader` from the [@ipld/car package](https://github.com/ipld/js-car).
