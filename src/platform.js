export { Blob, File } from '@web-std/file'
import f from '@web-std/fetch'
export const fetch = f

import _fs from 'fs'
export { _fs as fs }

import _path from 'path'
export { _path as path }

import { FsBlockStore } from 'ipfs-car/blockstore/fs'
export { FsBlockStore as Blockstore }

export { TextEncoder } from 'util'
