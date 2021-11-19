import Ajv, { JSONSchemaType, DefinedError, ErrorObject } from "ajv"
const ajv = new Ajv()

export interface Attribute {
    trait_type: string,
    value: string | number,
    display_type?: string,
    max_value?: number,
    trait_count?: number,
}

export interface FileDescription {
    uri: string,
    type: string,
    cdn?: boolean,
}

export interface CreatorInfo {
    address: string,
    share: number,
}

export interface CollectionInfo {
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
      creators: CreatorInfo[],
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
          additionalProperties: true,
          required: [ 'files', 'creators' ],
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

export class ValidationError extends Error {
  constructor(errors: ErrorObject[]) {
    const messages: string[] = []
    for (const err of errors as DefinedError[]) {
      switch (err.keyword) {
        case 'required':
          messages.push(`required property ${err.params.missingProperty} missing`)
          break
        case 'propertyNames':
          messages.push(`invalid property name: ${err.params.propertyName}`)
          break
        default:
          messages.push(err.message || 'unknown error')
      }
    }
    const message = 'metadata had validation errors: \n' + messages.join('\n')
    super(message)
  }
}

export function ensureValidMetadata(m: Record<string, any>): MetaplexMetadata {
  if (!validateMetadata(m)) {
    throw new ValidationError(validateMetadata.errors)
  }
  return m
}

// export const parseMetadata = ajv.compileParser(metadataSchema)
