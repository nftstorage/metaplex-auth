import fs from 'fs/promises'
import { parse } from 'ts-command-line-args'
import {
  AuthContext,
  MetaplexAuthWithSecretKey,
  SolanaCluster,
  makeMetaplexUploadToken,
} from './auth.js'
import { NFTStorageMetaplexor } from './upload.js'
import { getFilesFromPath } from 'files-from-path'
import { version as projectVersion } from '../package.json'

interface IArgs {
  keyfile: string
  cluster: string
  endpoint: string
  testCID?: string
  files?: string[]
}

const MINTING_AGENT = 'metaplex-auth/cli'
const CLUSTER_VALUES = ['mainnet-beta', 'devnet']
const DEFAULT_CLUSTER = 'devnet'

const args = parse<IArgs>({
  keyfile: { type: String, description: 'path to solana key file', alias: 'k' },
  cluster: {
    type: String,
    description: `name of solana cluster. valid choices: ${CLUSTER_VALUES.join(
      ', '
    )}.`,
    defaultValue: DEFAULT_CLUSTER,
  },
  endpoint: {
    type: String,
    description: 'api endpoint for nft.storage',
    defaultValue: 'https://api.nft.storage',
  },
  testCID: {
    type: String,
    optional: true,
    description: `CID to create a test token for. If present, upload will be skipped and token will be printed to the console.`,
  },
  files: { type: String, optional: true, multiple: true, defaultOption: true },
})

if (!CLUSTER_VALUES.includes(args.cluster)) {
  console.error(`invalid cluster value: ${args.cluster}`)
  process.exit(1)
}

async function storeFiles(client: NFTStorageMetaplexor, paths: string[]) {
  const files = await getFilesFromPath(paths)
  console.log(`uploading ${files.length} file${files.length > 1 ? 's' : ''}...`)

  // @ts-ignore - todo: figure out correct type to use for File param
  const rootCID = await client.storeDirectory(files)

  console.log('Upload complete!')
  console.log(`Root CID: ${rootCID}`)

  // strip leading / chars from filename
  const filenames = files.map((f) => f.name.replace(new RegExp('^\\/'), ''))
  const ipfsURIs = filenames.map(
    (f) => `ipfs://${rootCID}/${encodeURIComponent(f)}`
  )
  const gatewayURLs = filenames.map(
    (f) => `https://${rootCID}.ipfs.nftstorage.link/${f}`
  )

  console.log('-------- IPFS URIs: --------')
  console.log(ipfsURIs.join('\n'))
  console.log('-------- HTTP Gateway URLs: --------')
  console.log(gatewayURLs.join('\n'))
}

async function main() {
  const auth = await makeAuthContext(
    args.keyfile,
    args.cluster as SolanaCluster
  )

  if (args.testCID) {
    const token = await makeMetaplexUploadToken(auth, args.testCID)
    console.log('token: ', token)
    return
  }

  if (!args.files) {
    console.error('must provide file path argument when --testCID is not set')
    process.exit(1)
  }

  const client = new NFTStorageMetaplexor({
    auth,
    endpoint: new URL(args.endpoint),
  })

  await storeFiles(client, args.files)
}

async function loadKey(keyfilePath: string): Promise<Uint8Array> {
  const content = await fs.readFile(keyfilePath, { encoding: 'utf-8' })
  const keyArray = JSON.parse(content)
  return new Uint8Array(keyArray)
}

async function makeAuthContext(
  keyfilePath: string,
  solanaCluster: SolanaCluster
): Promise<AuthContext> {
  const secretKey = await loadKey(keyfilePath)
  return MetaplexAuthWithSecretKey(secretKey, {
    mintingAgent: MINTING_AGENT,
    agentVersion: projectVersion,
    solanaCluster,
  })
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
