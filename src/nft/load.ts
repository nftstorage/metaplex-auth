import { BlockstoreI, File } from 'nft.storage'
import { fs, path } from '../platform.js'
import { ensureValidMetadata, MetaplexMetadata } from '../metadata/index.js'
import { prepareMetaplexNFT } from './prepare.js'
import type { PackagedNFT } from './prepare.js'
import { isBrowser } from '../utils.js'

/**
 * Loads a Metaplex NFT from the filesystem, including metadata json, main image, and any
 * additional files referenced in the metadata.
 *
 * Loads [Metaplex NFT metadata JSON](https://docs.metaplex.com/nft-standard) from `metadataFilePath`,
 * using the image located at `imageFilePath`. If `imageFilePath` is not provided, attempts to find the image
 * in the following way:
 *
 * - If the metadata JSON object's `image` field contains the path to a file
 *   and the file exists, use it
 * - Otherwise, take the filename of the metadata file (e.g. `1.json`)
 *   and look for a file with the same basename and a `.png` extension (e.g. `1.png`).
 *
 * If no image file can be found, the returned promise will reject with an Error.
 *
 * In addition to the `image` field, if the `animation_url` contains a valid file path,
 * the file will be uploaded to NFT.Storage, and `animation_url` will be set to an
 * IPFS HTTP gateway link to the content.
 *
 * Entries in `properties.files` that contain valid file paths as their `uri` value will also be uploaded to
 * NFT.Storage, and each file will have two entries in the final metadata's `properties.files`
 * array. One entry contains an HTTP gateway URL as the `uri`, with the `cdn` field set to `true`, while the
 * other contains an `ipfs://` URI, with `cdn` set to `false`. This preserves the location-independent
 * "canonical" IPFS URI in the blockchain-linked record, while signalling to HTTP-only clients that they
 * can use the `cdn` variant.
 *
 * All file paths contained in the metadata should be relative to the directory containing the metadata file.
 *
 * Note that this function does NOT store anything with NFT.Storage. To store the returned `PackagedNFT` object,
 * see {@link NFTStorageMetaplexor.storePreparedNFT}, or use {@link NFTStorageMetaplexor.storeNFTFromFilesystem},
 * which calls this function and stores the result.
 *
 * This function is only available on node.js and will throw if invoked from a browser runtime.
 *
 * @param metadataFilePath path to a JSON file containing Metaplex NFT metadata
 * @param imageFilePath path to an image to be used as the primary `image` content for the NFT. If not provided,
 * the image will be located as described above.
 * @param opts
 * @param opts.blockstore a Blockstore instance to use when packing objects into CARs. If not provided, a new temporary Blockstore will be created.
 * @param opts.validateSchema if true, validate the metadata against a JSON schema before processing. off by default
 * @param opts.gatewayHost the hostname of an IPFS HTTP gateway to use in metadata links. Defaults to "nftstorage.link" if not set.
 *
 * @returns on success, a {@link PackagedNFT} object containing the parsed metadata and the CAR data to upload
 * to NFT.Storage.
 */
export async function loadNFTFromFilesystem(
  metadataFilePath: string,
  imageFilePath?: string,
  opts: {
    blockstore?: BlockstoreI
    validateSchema?: boolean
    gatewayHost?: string
  } = {}
): Promise<PackagedNFT> {
  if (isBrowser) {
    throw new Error('loadNFTFromFilesystem is only supported on node.js')
  }
  const metadataContent = await fs.promises.readFile(metadataFilePath, {
    encoding: 'utf-8',
  })
  const metadataJSON = JSON.parse(metadataContent)
  const metadata = opts.validateSchema
    ? ensureValidMetadata(metadataJSON)
    : (metadataJSON as unknown as MetaplexMetadata)

  const parentDir = path.dirname(metadataFilePath)

  // if no image path was provided, check if metadata.image contains a valid file path
  if (!imageFilePath) {
    const pathFromMetadata = path.resolve(parentDir, metadata.image)
    if (metadata.image && (await fileExists(pathFromMetadata))) {
      imageFilePath = pathFromMetadata
    } else {
      // as a last resort, look for a file based on the metadata filename.
      // for example, if metadata filename is `0.json`, look for `0.png`.
      const basename = path.basename(metadataFilePath, '.json')
      const pathFromMetadataFilename = path.resolve(
        parentDir,
        basename + '.png'
      )
      if (await fileExists(pathFromMetadataFilename)) {
        imageFilePath = pathFromMetadataFilename
      }
    }
  }

  // if we still don't have an image file path, bail out
  if (!imageFilePath) {
    throw new Error(`unable to determine path to image.`)
  }

  const imageFile = await fileFromPath(imageFilePath, parentDir)

  // look for valid file paths in `properties.files`
  const additionalFilePaths = new Set<string>()
  const properties = metadata.properties || {}
  const files = properties.files || []
  for (const f of files) {
    const filepath = path.resolve(parentDir, f.uri)
    if (await fileExists(filepath)) {
      additionalFilePaths.add(filepath)
    }
  }

  // if the image file is also in properties.files (which should be the case),
  // remove it from "additional" files to prevent it being processed twice
  additionalFilePaths.delete(path.basename(imageFilePath))

  // load all discovered files from disk (except image, which we already have)
  const additionalFilePromises = [...additionalFilePaths].map((p) =>
    fileFromPath(p, parentDir)
  )
  const additionalAssetFiles = await Promise.all(additionalFilePromises)

  // package up for storage and return the result
  return prepareMetaplexNFT(metadata, imageFile, {
    additionalAssetFiles,
    blockstore: opts.blockstore,
    gatewayHost: opts.gatewayHost,
    validateSchema: opts.validateSchema,
  })
}

export async function* loadAllNFTsFromDirectory(
  directoryPath: string,
  opts: {
    blockstore?: BlockstoreI
    validateSchema?: boolean
    gatewayHost?: string
  } = {}
): AsyncGenerator<PackagedNFT> {
  for await (const filename of walk(directoryPath)) {
    if (!filename.endsWith('.json')) {
      continue
    }
    const nft = await loadNFTFromFilesystem(filename, undefined, opts)
    yield nft
  }
}

// helpers

/**
 * Returns a File object with the contents of the file at the given path.
 * The `name` property of the returned file will be relative to the given `rootDir`,
 * for example:
 *
 * ```js
 * const f = await fileFromPath('/var/foo/stuff.txt', '/var/foo')
 * console.log(f.name) // => 'stuff.txt'
 * ```
 *
 * @param filepath
 * @param rootDir
 * @returns
 */
async function fileFromPath(
  filepath: string,
  rootDir: string = ''
): Promise<File> {
  const content = await fs.promises.readFile(filepath)
  const filename = path.relative(rootDir, filepath)
  return new File([content], filename)
}

/**
 *
 * @param filepath path to a file whose existence is in doubt
 * @returns true if the file exists, false if not
 */
async function fileExists(filepath: string): Promise<boolean> {
  if (isBrowser) {
    return false
  }
  try {
    await fs.promises.stat(filepath)
    return true
  } catch (e) {
    return false
  }
}

async function* walk(dir: string): AsyncGenerator<string> {
  if (isBrowser) {
    return
  }

  const files = await fs.promises.readdir(dir)
  for (const file of files) {
    const stat = await fs.promises.stat(path.join(dir, file))
    if (stat.isDirectory()) {
      for await (const filename of walk(path.join(dir, file))) {
        yield filename
      }
    } else {
      yield path.join(dir, file)
    }
  }
}
