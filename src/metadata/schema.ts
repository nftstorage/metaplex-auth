import { JSONSchemaType } from 'ajv'

export interface Attribute {
  trait_type: string
  value: string | number
  display_type?: string
  max_value?: number
  trait_count?: number
}

export interface FileDescription {
  uri: string
  type: string
  cdn?: boolean
}

export interface CreatorInfo {
  address: string
  share: number
}

/**
 * See https://docs.metaplex.com/nft-standard#collections
 */
export interface CollectionInfo {
  name: string
  family: string
}

/**
 * Interface for valid Metaplex NFT metadata, as defined at https://docs.metaplex.com/nft-standard.
 */
export interface MetaplexMetadata {
  name: string
  symbol?: string
  description?: string
  seller_fee_basis_points?: number
  image: string
  animation_url?: string
  external_url?: string
  attributes?: Attribute[]
  collection?: CollectionInfo
  properties: {
    category?: string
    files: Array<FileDescription>
    creators?: CreatorInfo[]
  }
}

const fileSchema: JSONSchemaType<FileDescription> = {
  type: 'object',
  properties: {
    uri: { type: 'string' },
    type: { type: 'string' },
    cdn: { type: 'boolean', nullable: true },
  },
  required: ['uri', 'type'],
}

const attributeSchema: JSONSchemaType<Attribute> = {
  type: 'object',
  properties: {
    trait_type: { type: 'string' },
    value: {
      anyOf: [{ type: 'string' }, { type: 'number' }],
    },
    display_type: {
      type: 'string',
      nullable: true,
    },
    max_value: {
      type: 'number',
      nullable: true,
    },
    trait_count: {
      type: 'number',
      nullable: true,
    },
  },
  required: ['trait_type', 'value'],
}

const creatorSchema: JSONSchemaType<CreatorInfo> = {
  type: 'object',
  properties: {
    address: { type: 'string' },
    share: { type: 'number' },
  },
  required: ['address', 'share'],
}

export const metadataSchema: JSONSchemaType<MetaplexMetadata> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    symbol: { type: 'string', nullable: true },
    description: { type: 'string', nullable: true },
    seller_fee_basis_points: { type: 'number', nullable: true },
    image: { type: 'string' },
    animation_url: { type: 'string', nullable: true },
    external_url: { type: 'string', nullable: true },
    attributes: {
      type: 'array',
      nullable: true,
      items: attributeSchema,
    },
    properties: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: fileSchema,
        },
        category: { type: 'string', nullable: true },
        creators: {
          type: 'array',
          items: creatorSchema,
          nullable: true,
        },
      },
      additionalProperties: true,
      required: ['files'],
    },
    collection: {
      type: 'object',
      nullable: true,
      properties: {
        name: { type: 'string' },
        family: { type: 'string' },
      },
      required: ['name', 'family'],
    },
  },
  required: ['name', 'image', 'properties'],
}
