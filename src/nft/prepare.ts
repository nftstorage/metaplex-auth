import { NFTStorage, CarReader, File } from "nft.storage"
import type { CID } from 'multiformats'

import { MetaplexMetadata, FileDescription, ensureValidMetadata } from '../metadata'
import { makeGatewayURL, makeIPFSURI } from '../utils'

export type EncodedCar = { car: CarReader, cid: CID }

export interface PackagedNFT {
  metadata: MetaplexMetadata,  
  metadataGatewayURL: string,
  metadataURI: string,

  encodedMetadata: EncodedCar,
  encodedAssets: EncodedCar,
}

/**
 * 
 * @param metadata a JS object containing (hopefully) valid Metaplex NFT metadata
 * @param imageFile a File object containing image data. 
 * @param additionalAssetFiles 
 * @returns 
 */
export async function prepareMetaplexNFT(metadata: Record<string, any>, imageFile: File, ...additionalAssetFiles: File[]): Promise<PackagedNFT> {
  const validated = ensureValidMetadata(metadata)

  const assetFiles = [imageFile, ...additionalAssetFiles]
  const encodedAssets = await NFTStorage.encodeDirectory(assetFiles)

  const imageFilename = imageFile.name || 'image.png'
  const additionalFilenames = additionalAssetFiles.map(f => f.name)

  const linkedMetadata = replaceFileRefsWithIPFSLinks(validated, imageFilename, additionalFilenames, encodedAssets.cid.toString())
  const metadataFile = new File([JSON.stringify(linkedMetadata)], 'metadata.json')
  const encodedMetadata = await NFTStorage.encodeDirectory([metadataFile])
  const metadataGatewayURL = makeGatewayURL(encodedMetadata.cid.toString(), 'metadata.json')
  const metadataURI = makeIPFSURI(encodedMetadata.cid.toString(), 'metadata.json')

  return {
    metadata: linkedMetadata,
    encodedMetadata,
    encodedAssets,
    metadataGatewayURL,
    metadataURI,
  }
}

function replaceFileRefsWithIPFSLinks(metadata: MetaplexMetadata, imageFilename: string, additionalFilenames: string[], assetRootCID: string): MetaplexMetadata {
  const imageGatewayURL = makeGatewayURL(assetRootCID, imageFilename)

  // For each entry in properties.files, we check to see if the `uri` field matches the filename
  // of any uploaded files. If so, we add two entries to the output `properties.files` array -
  // one with a gateway URL with `cdn = true`, and one `ipfs://` uri with `cdn = false`.
  // If the uri does not match the filename of any uploaded files, it is included as is.
  const files: FileDescription[] = metadata.properties.files.flatMap(f => {
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
        }
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
    }
  }
}
