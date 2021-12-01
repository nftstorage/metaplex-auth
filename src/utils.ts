const GATEWAY_HOST = 'https://dweb.link'

export const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'

export function makeGatewayURL(cid: string, path: string): string {
  const base = new URL(`/ipfs/${cid}`, GATEWAY_HOST)
  const u = new URL(path, base)
  return u.toString()
}

export function makeIPFSURI(cid: string, path: string): string {
  const u = new URL(path, `ipfs://${cid}`)
  return u.toString()
}
