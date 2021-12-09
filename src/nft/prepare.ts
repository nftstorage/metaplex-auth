import { CarReader, File } from 'nft.storage'
import { pack } from 'ipfs-car/pack'
import { MemoryBlockStore } from 'ipfs-car/blockstore/memory'
import { CID } from 'multiformats'
import * as Block from 'multiformats/block'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'
import { BlockstoreCarReader } from './bs-car-reader'

import {
  MetaplexMetadata,
  FileDescription,
  ensureValidMetadata,
} from '../metadata'
import { makeGatewayURL, makeIPFSURI } from '../utils'

export interface PackagedNFT {
  metadata: MetaplexMetadata
  metadataGatewayURL: string
  metadataURI: string
  car: CarReader
  rootCID: CID
  assetRootCID: CID
}

/**
 * Encodes the given NFT metadata and asset files into CARs that can be uploaded to
 * NFT.Storage.
 *
 * First, the `imageFile` and any `additionalAssetFiles` are packed into a CAR,
 * and the root CID of this "asset CAR" is used to create IPFS URIs and gateway
 * URLs for each file in the NFT bundle.
 *
 * The input metadata is then modified:
 *
 * - The `image` field is set to an HTTP gateway URL for the `imageFile`
 * - If `animation_url` contains a filename that matches the `name` of any
 *   of the `additionalAssetFiles`, its value will be set to an HTTP gateway URL
 *   for that file.
 * - If any entries in `properties.files` have a `uri` that matches the `name`
 *   of `imageFile` or any of the `additionalAssetFiles`, it will be replaced
 *   by _two_ entries in the output metadata. One will contain an `ipfs://` uri
 *   with `cdn == false`, and the other will have an HTTP gateway URL, with
 *   `cdn == true`.
 *
 * This updated metadata is then serialized and packed into a second car.
 * Both CARs are returned in a {@link PackagedNFT} object, which also contains
 * the updated metadata object and links to the metadata.
 *
 * Note that this function does NOT store anything with NFT.Storage. The links
 * in the returned {@link PackagedNFT} will not resolve until the CARs have been
 * uploaded. Use {@link NFTStorageMetaplexor.storePreparedNFT} to upload.
 *
 * @param metadata a JS object containing (hopefully) valid Metaplex NFT metadata
 * @param imageFile a File object containing image data.
 * @param additionalAssetFiles any additional asset files (animations, higher resolution variants, etc)
 * @returns
 */
export async function prepareMetaplexNFT(
  metadata: Record<string, any>,
  imageFile: File,
  ...additionalAssetFiles: File[]
): Promise<PackagedNFT> {
  const validated = ensureValidMetadata(metadata)

  const blockstore = new MemoryBlockStore()
  const assetFiles = [imageFile, ...additionalAssetFiles]
  const { root: assetRoot } = await pack({
    input: assetFiles,
    blockstore,
    wrapWithDirectory: true,
  })

  const imageFilename = imageFile.name || 'image.png'
  const additionalFilenames = additionalAssetFiles.map((f) => f.name)

  const linkedMetadata = replaceFileRefsWithIPFSLinks(
    validated,
    imageFilename,
    additionalFilenames,
    assetRoot.toString()
  )
  const metadataFile = new File(
    [JSON.stringify(linkedMetadata)],
    'metadata.json'
  )

  const { root: metadataRoot } = await pack({
    input: [metadataFile],
    blockstore,
    wrapWithDirectory: true,
  })

  const block = await Block.encode({
    value: {
      ...stripUndefinedValues(linkedMetadata),
      'metadata.json': metadataRoot,
      type: 'nft/metaplex',
    },
    codec: dagCbor,
    hasher: sha256,
  })
  await blockstore.put(block.cid, block.bytes)
  const car = new BlockstoreCarReader(1, [block.cid], blockstore)

  const metadataGatewayURL = makeGatewayURL(
    block.cid.toString(),
    'metadata.json'
  )
  const metadataURI = makeIPFSURI(block.cid.toString(), 'metadata.json')

  return {
    metadata: linkedMetadata,
    metadataGatewayURL,
    metadataURI,
    car,
    rootCID: block.cid,
    assetRootCID: assetRoot,
  }
}

/**
 * Helper to remove entries whose value is `undefined`, as IPLD does not support undefined values
 */
function stripUndefinedValues(m: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {}
  for (const [k, v] of Object.entries(m)) {
    if (v === undefined) {
      continue
    }
    if (typeof v === 'object') {
      out[k] = stripUndefinedValues(v)
      continue
    }
    out[k] = v
  }
  return out
}

function replaceFileRefsWithIPFSLinks(
  metadata: MetaplexMetadata,
  imageFilename: string,
  additionalFilenames: string[],
  assetRootCID: string
): MetaplexMetadata {
  const imageGatewayURL = makeGatewayURL(assetRootCID, imageFilename)

  // For each entry in properties.files, we check to see if the `uri` field matches the filename
  // of any uploaded files. If so, we add two entries to the output `properties.files` array -
  // one with a gateway URL with `cdn = true`, and one `ipfs://` uri with `cdn = false`.
  // If the uri does not match the filename of any uploaded files, it is included as is.
  const files: FileDescription[] = metadata.properties.files.flatMap((f) => {
    if (f.uri === imageFilename || additionalFilenames.includes(f.uri)) {
      return [
        {
          ...f,
          uri: makeGatewayURL(assetRootCID, f.uri),
          cdn: true,
        },
        {
          ...f,
          uri: makeIPFSURI(assetRootCID, f.uri),
          cdn: false,
        },
      ]
    }
    return [f]
  })

  // If animation_url matches a filename, replace with gateway url
  let animation_url = metadata.animation_url
  if (animation_url && additionalFilenames.includes(animation_url)) {
    animation_url = makeGatewayURL(assetRootCID, animation_url)
  }

  return {
    ...metadata,
    image: imageGatewayURL,
    animation_url,
    properties: {
      ...metadata.properties,
      files,
    },
  }
}
