import { pack } from 'ipfs-car/pack'
import { CarReader } from '@ipld/car'
import { MemoryBlockStore } from 'ipfs-car/blockstore/memory'
import type { CID } from 'multiformats/cid'

export interface PackCarsResult {
  car: CarReader,
  root: CID,
}

export async function packCars(...files: File[]): Promise<PackCarsResult> {
  const blockstore = new MemoryBlockStore()
  try {
    const { out, root } = await pack({
      input: Array.from(files).map((f) => ({
        path: f.name,
        content: f.stream() as unknown as ReadableStream<Uint8Array>
      })),
      blockstore,
      wrapWithDirectory: true,
      maxChunkSize: 1048576,
      maxChildrenPerNode: 1024
    })
    const car = await CarReader.fromIterable(out)
    return { car, root }
  } finally {
    await blockstore.close()
  }
}

