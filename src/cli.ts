import fs from 'fs/promises'
import { parse } from 'ts-command-line-args'
import { AuthContext, MetaplexAuthWithSecretKey, SolanaCluster } from './auth.js'
import { NFTStorageUploader } from './upload.js'
import { getFilesFromPath } from 'files-from-path'

interface IArgs {
  keyfile: string
  cluster: string
  files: string[]
}

const CLUSTER_VALUES = ['mainnet-beta', 'devnet']
const DEFAULT_CLUSTER = 'devnet'

const args = parse<IArgs>({
  keyfile: { type: String, description: "path to solana key file", alias: 'k' },
  cluster: { type: String, description: `name of solana cluster. valid choices: ${CLUSTER_VALUES.join(', ')}.`, defaultValue: DEFAULT_CLUSTER },
  files: { type: String, multiple: true, defaultOption: true }
})

if (!CLUSTER_VALUES.includes(args.cluster)) {
  console.error(`invalid cluster value: ${args.cluster}`)
  process.exit(1)
}

async function main() {
  const auth = await makeAuthContext(args.keyfile, args.cluster as SolanaCluster)
  const files = await getFilesFromPath(args.files)

  const uploader = new NFTStorageUploader(auth)
  console.log(`uploading ${files.length} file${files.length > 1 ? 's' : ''}...`)
  
  // @ts-ignore - todo: figure out correct type to use for File param
  const result = await uploader.uploadFiles(files, {
    onStoredChunk: (size) => {
      console.log(`stored chunk of ${size} bytes`)
    }
  })

  console.log('Upload complete!')
  console.log(`Root CID: ${result.rootCID}`)
  console.log('-------- IPFS URIs: --------')
  console.log(result.ipfsURIs().join('\n'))
  console.log('-------- HTTP Gateway URLs: --------')
  console.log(result.gatewayURLs().map(u => u.toString()).join('\n'))
}


async function loadKey(keyfilePath: string): Promise<Uint8Array> {
  const content = await fs.readFile(keyfilePath, { encoding: 'utf-8' })
  const keyArray = JSON.parse(content)
  return new Uint8Array(keyArray)
}

async function makeAuthContext(keyfilePath: string, cluster: SolanaCluster): Promise<AuthContext> {
  const secretKey = await loadKey(keyfilePath)
  return MetaplexAuthWithSecretKey(secretKey, cluster)
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e)
    process.exit(1)
  })