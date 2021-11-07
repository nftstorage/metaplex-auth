import pRetry from "p-retry";
import { transform } from "streaming-iterables"
import { CarReader } from "@ipld/car/lib/reader-browser";
import { CID } from "multiformats";
import { AuthContext, getUploadToken } from "./auth";
import { TreewalkCarSplitter } from "carbites";
import { packFiles } from "./car";


const MAX_PUT_RETRIES = 5
const MAX_CONCURRENT_UPLOADS = 3
const MAX_CHUNK_SIZE = 1024 * 1024 * 10 // chunk to ~10MB CARs

type CarFileUploader = (carFile: Blob, carRoot: string, uploadToken: string) => Promise<string>

function metaplexAuthHeaders(uploadToken: string) {
  return {
   'Authorization': `X-Metaplex-Bearer ${uploadToken}`
  }
}

abstract class Uploader {
  auth: AuthContext

  constructor(auth: AuthContext) {
    this.auth = auth
  }

  abstract putCarFile(carFile: Blob, carRoot: string, uploadToken: string): Promise<string>

  async uploadFiles(files: File[]): Promise<string> {
    const { car, root } = await packFiles(...files)
    return this.uploadCar(car, root)
  }

  async uploadCar(car: CarReader, root: CID): Promise<string> {
    const carRoot = root.toString()
    const uploadToken = await getUploadToken(this.auth, carRoot)
  
    const chunkUploader = await carChunkUploader({
      carRoot, 
      uploadToken,
      maxRetries: MAX_PUT_RETRIES,
      carFileUploader: this.putCarFile
    })
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

  async putCarFile  (carFile, carRoot, uploadToken): Promise<string> {
    const putCarEndpoint = new URL("/upload", this.endpoint)

    const headers = metaplexAuthHeaders(uploadToken)
    const request = await fetch(putCarEndpoint.toString(), {
      method: 'POST',
      headers,
      body: carFile,
    })
    const res = await request.json()
    if (!request.ok) {
      throw new Error(res.error.message)
    }

    if (res.value.cid !== carRoot) {
      throw new Error(`root CID mismatch, expected: ${carRoot}, received: ${res.value.cid}`)
    }
    return res.value.cid
  }
}


export class Web3StorageUploader extends Uploader {
  endpoint: string

  constructor(auth: AuthContext, endpoint: string = "https://api.web3.storage") {
    super(auth)
    this.endpoint = endpoint
  }

  async putCarFile (carFile, carRoot, uploadToken): Promise<string> {
    const putCarEndpoint = new URL("/car", this.endpoint)

    const headers = metaplexAuthHeaders(uploadToken)
    const request = await fetch(putCarEndpoint.toString(), {
      method: 'POST',
      headers,
      body: carFile
    })
    const res = await request.json()
    if (!request.ok) {
      throw new Error(res.message)
    }

    if (res.cid !== carRoot) {
      throw new Error(`root CID mismatch, expected: ${carRoot}, received: ${res.cid}`)
    }
    return res.cid
  }
}



type PutCarFunc = (carPartsIterable: AsyncIterable<Uint8Array>) => Promise<string>

async function carChunkUploader({carRoot, uploadToken, maxRetries, carFileUploader}: {
  carRoot: string, 
  uploadToken: string,
  maxRetries: number
  carFileUploader: CarFileUploader,
}): Promise<PutCarFunc> {

  return async car => {
    const carParts = []
    for await (const part of car) {
      carParts.push(part)
    }
  
    const carFile = new Blob(carParts, { type: 'application/car' })
    const res = await pRetry(
      () => carFileUploader(carFile, carRoot, uploadToken),
      { retries: maxRetries }
    )
  
    // onStoredChunk && onStoredChunk(carFile.size)
    return res
  }
}
