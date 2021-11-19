import { File } from 'nft.storage'
import { ensureValidMetadata } from './schema'
import { prepareMetaplexNFT } from './prepare'
import type { PackagedNFT } from './prepare'


const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'

async function fileExists(filepath: string): Promise<boolean> {
  if (isBrowser) {
    return false
  }
  const fs = await import('fs/promises')
  try {
    await fs.stat(filepath)
    return true
  } catch (e) {
    return false
  }
}

export async function loadNFTFromFilesystem(metadataFilePath: string, imageFilePath?: string): Promise<PackagedNFT> {
  if (isBrowser) {
    throw new Error('loadNFTFromFilesystem is only supported on node.js')
  }

  const fs = await import('fs/promises')
  const path = await import('path')

  const metadataContent = await fs.readFile(metadataFilePath, { encoding: 'utf-8' })
  const metadataJSON = JSON.parse(metadataContent)
  const metadata = ensureValidMetadata(metadataJSON)

  const parentDir = path.dirname(metadataFilePath)

  // if no image path was provided, check if metadata.image contains a valid file path
  if (!imageFilePath) {
    const pathFromMetadata = path.resolve(parentDir, metadata.image)
    if (await fileExists(pathFromMetadata)) {
      imageFilePath = pathFromMetadata
    } else {
      // as a last resort, look for a file based on the metadata filename.
      // for example, if metadata filename is `0.json`, look for `0.png`.
      const basename = path.basename(metadataFilePath, '.json')
      const pathFromMetadataFilename = path.resolve(parentDir, basename + '.png')
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

  // look for valid filepaths in `properties.files` and load them from disk
  const additionalFilePaths = []
  for (const f of metadata.properties.files) {
    const filepath = path.resolve(parentDir, f.uri)
    if (await fileExists(filepath)) {
      additionalFilePaths.push(filepath)
    }
  }

  const additionalFilePromises = additionalFilePaths.map(p => fileFromPath(p, parentDir))
  const additionalFiles = await Promise.all(additionalFilePromises)

  return prepareMetaplexNFT(metadata, imageFile, ...additionalFiles)
}

async function fileFromPath(filepath: string, rootDir: string = ''): Promise<File> {
  const fs = await import('fs/promises')
  const path = await import('path')

  const content = await fs.readFile(filepath)
  const filename = path.relative(rootDir, filepath)
  return new File([content], filename)
}