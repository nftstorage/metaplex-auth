# Metaplex / NFT.Storage auth specification

Author: Yusef Napora <yusef@protocol.ai>

Last revision: 2021-12-10

This document describes the public-key based authentication scheme used to make [NFT.Storage](https://nft.storage) accessible to all Metaplex users free of charge.

## Motivations and context

This system was designed in late 2021 as part of Protocol Labs efforts to ensure long-term storage of NFTs. By providing a free and simple on-ramp for Solana / Metaplex users, we can put Filecoin's massive capacity to good use and provide a great user experience for people minting on Metaplex.

Our goal with the authentication system is to allow anyone with a valid Solana account to use NFT.Storage without any prior authorization or coordination. In other words, there's no need to create an account at https://nft.storage ahead of time.

Instead, a user can prepare a JWT token using the `EdDSA` signature scheme and the signing key for their mint account. The details of constructing and signing the JWT are described in [Token details](#token-details) later in this document.

Inside the JWT is a small payload containing the user's public key and a "request description" that captures the intent of the request.

To create the JWT, the user will need access to their Solana private key or a [wallet adapter](https://github.com/solana-labs/wallet-adapter) supporting the `signMessage` method (some supported wallets are listed [here](https://github.com/solana-labs/wallet-adapter/blob/master/FAQ.md#how-can-i-sign-and-verify-messages)).

## The `x-web3auth` header

The NFT.Storage API exposes a `/metaplex/upload` route that does not require an `Authorization` header. Instead, it will require an `x-web3auth` header, whose contents must be `Metaplex <token>`, where `<token>` is a signed JWT token as decribed [below](#token-details).

## Token details

Each operation that a user wants to perform must be authorized individually with a one-time-use token. This is in contrast to using an NFT.Storage API token, which authorizes any request the user account is capable of.

The token payload must contain the following fields:

- `iss`: a [did:key decentralized identifier](https://w3c-ccg.github.io/did-method-key/) containing the Ed25519 public key for the users mint account.
- `req`: a "request description" JSON object, described below.

An example token payload looks like this:

```json
{
  "iss": "did:key:z6Mkh74NGBSqQGqeKa2wVuJyRJ1ZJwPngHPg9V6DY2qnVnA5",
  "req": {
    "put": {
      "rootCID": "bafkreifeqjorwymdmh77ars6tbrtno74gntsdcvqvcycucidebiri2e7qy",
      "tags": {
        "mintingAgent": "my-awesome-tool",
        "agentVersion": "0.1.0",
        "chain": "solana",
        "solanaCluster": "devnet"
      }
    }
  }
}
```

### Request description

The `req` field describes the request that the user is trying to perform.

There is currently only one supported request type, `put`, which uploads a CAR file identified by its root CID.

#### put

A `put` request description must contain a `rootCID` field whose value is the root CID of a Content Archive included in the request body.
The CID should be encoded as a CIDv1 string.

The `put` object also contains a `tags` key/value map that may contain arbitrary metadata tags. Currently accepted tags are listed below:

##### `chain`

Indicates the blockchain that will be used for minting. Currently the only valid value is `"solana"`.

##### `solanaCluster`

Indicates which [Solana cluster](https://docs.solana.com/clusters) will be used for minting. Must be provided when `chain == "solana"`. Acceptable values are: `"mainnet-beta"`, `"devnet"`, `"testnet"`.

**Note:** an earlier draft of this spec & library used the key `solana-cluster` for this tag. This was changed to "camel case" for consistency and to play nice with JavaScript conventions.

##### `mintingAgent`

The `tags` map MUST include a `mintingAgent` tag, whose value should identify the tool or platform used to prepare the upload.

Projects using this library are free to choose their own value for this tag, however you should avoid changing the name over time, unless the project itself changes names (for example, due to a community fork or re-branding).

For personal projects or individuals creating tools that are not affiliated with a public platform, please set the value to a URL for your code repository. If your code is not yet public, please create a repository containing a description of the project and links to its public-facing interface.

Examples of suitable values:

- `"metaplex/candy-machine-cli"`
- `"metaplex/js-sdk"`
- `"magiceden/mint-authority"`
- `"https://github.com/samuelvanderwaal/metaboss"`

##### `agentVersion`

The tags map may optionally include an `agentVersion` tag that identifies a specific version of the tool or platform, using whatever convention is used by the project (e.g. semver, etc.)

##### Unrecognized tags

Unrecognized tags will be discarded by the backend, and tags should not be used to store arbitrary metadata. Future revisions to this spec may introduce additional tags.

### Signing the token

The token uses the `EdDSA` signature algorithm with Ed25519 keys, which is not supported by all JWT libraries.

To create a token manually, you can encode the JWT header and body into a UTF-8 string of JSON text, which is then base64url encoded. The base64-encoded header and payload are then joined by a `.` character, and the UTF-8 bytes of the joined string are signed using the users private Ed25519 key.

The token header will always be:

```json
{
  "alg": "EdDSA",
  "typ": "JWT"
}
```

Here's what creating a token might look like. For a real example, see [./src/auth.ts](./src/auth.ts).

```js
const header = {
  alg: 'EdDSA',
  typ: 'JWT',
}

const payload = {
  iss: 'did:key:z6Mkh74NGBSqQGqeKa2wVuJyRJ1ZJwPngHPg9V6DY2qnVnA5',
  req: {
    put: {
      rootCID: 'bafkreifeqjorwymdmh77ars6tbrtno74gntsdcvqvcycucidebiri2e7qy',
      tags: {
        chain: 'solana',
        'solana-cluster': 'devnet',
      },
    },
  },
}

// assume base64urlencode is defined elsewhere
const headerStr = base64urlencode(JSON.stringify(header))
const payloadStr = base64urlencode(JSON.stringify(payload))
const unsignedTokenStr = headerStr + '.' + payloadStr

// we need to sign the UTF-8 bytes of the token string
const unsignedBytes = new TextEncoder().encode(unsignedTokenStr)

// assume that secretKey is a Uint8Array containing your signing key
// and that tweetnacl is imported
const sig = nacl.sign.detached(unsignedBytes, secretKey)
const sigStr = base64urlencode(sig)

// all done!
const token = unsignedTokenStr + '.' + sigStr
```
