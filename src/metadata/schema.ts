import Ajv, {JSONSchemaType} from "ajv"
const ajv = new Ajv()

interface Attribute {
    trait_type: string,
    value: string | number,
    display_type?: string,
    max_value?: number,
    trait_count?: number,
}

interface FileDescription {
    uri: string,
    type: string,
    cdn?: boolean,
}

interface CreatorInfo {
    address: string,
    share: number,
}

interface CollectionInfo {
    name: string,
    family: string,
}

export interface MetaplexMetadata {
    name: string,
    symbol: string,
    description?: string,
    seller_fee_basis_points: number,
    image: string,
    animation_url?: string,
    external_url?: string,
    attributes?: Attribute[],
    collection?: CollectionInfo,
    properties: {
        category?: string,
        files: Array<FileDescription>,
        creators: CreatorInfo[]
    }
}


const fileSchema: JSONSchemaType<FileDescription> = {
    type: 'object',
    properties: {
        uri: { type: "string" },
        type: { type: "string" },
        cdn: { type: "boolean", nullable: true }
    },
    required: [ 'uri', 'type' ]
}

const attributeSchema: JSONSchemaType<Attribute> = {
    type: "object",
    properties: {
      trait_type: { type: "string" },
      value: {
        anyOf: [
          { type: "string" },
          { type: "number" }
        ]
      },
      display_type: {
        type: "string",
        nullable: true,
      },
      max_value: {
        type: "number",
        nullable: true,
      },
      trait_count: {
        type: "number",
        nullable: true,
      }
    },
    required: [ 'trait_type', 'value' ]
  }

const creatorSchema: JSONSchemaType<CreatorInfo> = {
    type: "object",
    properties: {
      address: { type: "string" },
      share: { type: "number" }
    },
    required: [ 'address', 'share' ]
  }

export const metadataSchema: JSONSchemaType<MetaplexMetadata> = {
    type: 'object',
    properties: {
        name: { type: "string" },
        symbol: { type: "string" },
        description: { type: "string", nullable: true },
        seller_fee_basis_points: { type: "number" },
        image: { type: "string" },
        animation_url: { type: "string", nullable: true },
        external_url: { type: "string", nullable: true },
        attributes: {
          type: "array",
          nullable: true,
          items: attributeSchema,
        },
        properties: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: fileSchema,
            },
            category: { type: "string", nullable: true },
            creators: {
              type: 'array',
              items: creatorSchema,
            }
          },
          required: [ 'files', 'creators' ]
        },
        collection: {
          type: "object",
          nullable: true,
          properties: {
            name: { type: "string" },
            family: { type: "string" }
          },
          required: [ 'name', 'family' ]
        }
    },
    required: [ "name", "symbol", "seller_fee_basis_points", "image", "properties" ]
}

export const validateMetadata = ajv.compile(metadataSchema)

// export const parseMetadata = ajv.compileParser(metadataSchema)
