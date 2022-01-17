const file = File
const blob = Blob
const _fetch = fetch

export { file as File, blob as Blob, _fetch as fetch }

const dummyFS = {
  promises: {
    readFile() {
      throw new Error('not implemented in browser')
    },
    stat() {
      throw new Error('not implemented in browser')
    },
  },
}

export { dummyFS as fs }

import _path from 'path-browserify'
export { _path as path }
