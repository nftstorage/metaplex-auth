import { transform } from "streaming-iterables"
import { CarReader } from "@ipld/car/lib/reader-browser";
import { CID } from "multiformats";
import { TreewalkCarSplitter } from "carbites";

import { packFiles } from "./car";
import { AuthContext, getUploadCredentials } from "./auth";
import type { UploadCredentials } from './auth';

const MAX_PUT_RETRIES = 1
const MAX_CONCURRENT_UPLOADS = 3
const MAX_CHUNK_SIZE = 1024 * 1024 * 10 // chunk to ~10MB CARs
const DEFAULT_GATEWAY_HOST = "https://dweb.link"

function metaplexAuthHeaders(creds: UploadCredentials) {
  return {
   'x-web3auth': `Metaplex ${creds.token}`,
   'x-web3meta': JSON.stringify(creds.meta),
  }
}

interface PutOptions {
  maxRetries?: number,
  onStoredChunk?: (size: number) => void,
}

type IPFSUri = string
type CIDString = string

interface UploadFilesResult {
  rootCID: string,
  filenames: string[],

  ipfsURIs(): IPFSUri[],
  gatewayURLs(host?: string): URL[],
}

/**
 * Base Uploader class for adding data to a *.storage backend using a metaplex {@link AuthContext}.
 * 
 * This class implements the common functionality of packing File data into CARs, requesting an
 * upload token from the auth service using the AuthContext, splitting the CAR into
 * chunks, and sending each chunk to the backend API. The derived classes must implement the
 * {@link putCarFile} method, which takes a Blob containing a single chunked CAR and uploads it
 * to the backend.
 *
 */
abstract class Uploader {
  auth: AuthContext

  constructor(auth: AuthContext) {
    this.auth = auth
  }

  /**
   * Uploads a Blob containing data of type `application/car` to this Uploader's API.
   * 
   * Must be defined in derived classes. See {@link NFTStorageUploader.putCarFile}.
   * 
   * @param carFile - a Blob containing CAR data, with content type set to `application/car`.
   * @param carRoot - the root CID of the CAR file, as a string.
   * @param uploadCreds - a one-time-use upload token, specific to this root CID, plus associated metadata.
   */
  abstract putCarFile(carFile: Blob, carRoot: string, uploadCreds: UploadCredentials): Promise<string>

  /**
   * Uploads one or more {@link File}s to uploader's backend API.
   * The uploaded files will be wrapped in an IPFS directory.
   * 
   * @param files 
   * @param opts 
   * @returns - an object containing the root CID of the upload, as well as the filenames and accessor methods for creating IPFS uris or gateway URLs for each file.
   */
  async uploadFiles(files: File[], opts: PutOptions = {}): Promise<UploadFilesResult> {
    const { car, root } = await packFiles(...files)
    const rootCID = await this.uploadCar(car, root, opts)

    // trim leading slashes from filenames
    const filenames = files.map(f => f.name.replace(new RegExp('^\\/'), ''))
    
    const ipfsURIs = () => filenames.map(n => `ipfs://${rootCID}/${encodeURIComponent(n)}`)
    const gatewayURLs = (host: string = DEFAULT_GATEWAY_HOST) => 
      filenames.map(n => new URL(`/ipfs/${rootCID}/${encodeURIComponent(n)}`, host))
    

    return {
      rootCID,
      filenames,
      ipfsURIs,
      gatewayURLs,
    }
  }

  async uploadCar(car: CarReader, root: CID, opts: PutOptions = {}): Promise<CIDString> {
    const { default: pRetry } = await import('p-retry')

    const maxRetries = opts.maxRetries ?? MAX_PUT_RETRIES
    const { onStoredChunk } = opts

    const carRoot = root.toString()
    const creds = await getUploadCredentials(this.auth, carRoot)
  
    const chunkUploader = async (carChunk: AsyncIterable<Uint8Array>) => {
      const carParts = []
      for await (const part of carChunk) {
        carParts.push(part)
      }
    
      const carFile = new Blob(carParts, { type: 'application/car' })
      const res = await pRetry(
        () => this.putCarFile(carFile, carRoot, creds),
        { retries: maxRetries }
      )
      // const res = await this.putCarFile(carFile, carRoot, uploadToken)
      
      onStoredChunk && onStoredChunk(carFile.size)
      return res
    }

    const upload = transform(MAX_CONCURRENT_UPLOADS, chunkUploader)
    const splitter = new TreewalkCarSplitter(car, MAX_CHUNK_SIZE)
    
    for await (const _ of upload(splitter.cars())) {}
    return root.toString()
  }
}



export class NFTStorageUploader extends Uploader {
  endpoint: string

  constructor(auth: AuthContext, endpoint: string = "https://api.nft.storage") {
    super(auth)
    this.endpoint = endpoint
  }

  async putCarFile (carFile: Blob, carRoot: string, uploadCreds: UploadCredentials): Promise<string> {
    const putCarEndpoint = new URL("/metaplex/upload", this.endpoint)

    const headers = metaplexAuthHeaders(uploadCreds)
    const request = await fetch(putCarEndpoint.toString(), {
      method: 'POST',
      headers,
      body: carFile,
    })
    const res = await request.json() as { error?: { message: string }, value?: { cid: string } }
    if (!request.ok) {
      throw new Error(res.error?.message ?? 'unknown error')
    }

    if (res.value?.cid !== carRoot) {
      throw new Error(`root CID mismatch, expected: ${carRoot}, received: ${res.value?.cid}`)
    }
    return carRoot
  }
}
