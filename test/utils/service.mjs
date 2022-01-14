import { importCar } from './importer.mjs'
import { Response, Request } from './mock-server.mjs'

/**
 * @param {Request} request
 */
const headers = ({ headers }) => ({
  'Access-Control-Allow-Origin': headers.get('origin') || '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  // Allow all future content Request headers to go back to browser
  // such as Authorization (Bearer) or X-Client-Name-Version
  'Access-Control-Allow-Headers':
    headers.get('Access-Control-Request-Headers') || '',
  'Content-Type': 'application/json;charset=UTF-8',
})

/**
 * @param {Request} request
 */
const importUpload = async (request) => {
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/car')) {
    throw new Error(`unexpected content type: ${contentType}`)
  }
  const content = await request.arrayBuffer()
  return await importCar(new Uint8Array(content))
}

/**
 * @typedef {{AUTH_TOKEN:string, store: Map<string, any>}} State
 * @param {string} [token]
 * @param {Map<string, any>} [store]
 * @returns {State}
 */
export const init = (
  token = Math.random().toString(32).slice(2),
  store = new Map()
) => ({
  AUTH_TOKEN: token,
  store,
})

/**
 * @param {Request} request
 * @param {State} state
 */
export const handle = async (request, { store }) => {
  const url = new URL(request.url)

  const [_, ...pathParts] = url.pathname.split('/')
  const auth = request.headers.get('x-web3auth')
  const [, token] = (auth && auth.match(/Metaplex (.+)/)) || []

  // If preflight
  if (request.method === 'OPTIONS') {
    return new Response('', { headers: headers(request) })
  }

  const authorize = () => {
    // If not authorized 401
    if (!token) {
      throw Object.assign(new Error('Unauthorized'), { status: 401 })
    }
  }

  try {
    switch (`${request.method} /${pathParts.join('/')}`) {
      case 'POST /metaplex/upload/':
      case 'POST /metaplex/upload': {
        authorize()
        const { cid } = await importUpload(request)
        const key = `${token}:${cid}`
        if (!store.get(key)) {
          const created = new Date()
          store.set(key, {
            cid: cid.toString(),
            deals: [],
            pin: {
              cid: cid.toString(),
              status: 'pinned',
              created,
            },
            created,
          })
        }
        const result = { ok: true, value: { cid: cid.toString() } }

        return new Response(JSON.stringify(result), {
          headers: headers(request),
        })
      }

      default: {
        const result = {
          ok: false,
          error: { message: `No such API endpoint ${url.pathname}` },
        }

        return new Response(JSON.stringify(result), {
          status: 404,
          headers: headers(request),
        })
      }
    }
  } catch (err) {
    const error = /** @type {Error & {status: number}} */ (err)
    return new Response(
      JSON.stringify({
        ok: false,
        error: { message: error.message || 'failed to handle request' },
      }),
      {
        status: error.status || 500,
        headers: headers(request),
      }
    )
  }
}
