export const DEFAULT_GATEWAY_HOST = 'https://nftstorage.link'

export const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'

export function makeGatewayURL(
  cid: string,
  path: string,
  host: string = DEFAULT_GATEWAY_HOST
): string {
  let pathPrefix = `/ipfs/${cid}`
  if (path) {
    pathPrefix += '/'
  }
  host = host || DEFAULT_GATEWAY_HOST
  const base = new URL(pathPrefix, host)
  const u = new URL(path, base)
  return u.toString()
}

export function makeIPFSURI(cid: string, path: string): string {
  const u = new URL(path, `ipfs://${cid}`)
  return u.toString()
}
