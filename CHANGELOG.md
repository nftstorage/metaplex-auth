# 2022-04-14 - v1.2.0

- [Add ability to bundle many NFTs into one CAR for upload](https://github.com/nftstorage/metaplex-auth/pull/39)

# 2022-02-09 - v1.1.0

- [Add `storeBlob` methods](https://github.com/nftstorage/metaplex-auth/pull/37)

# 2022-01-24 - v1.0.0

To celebrate our first breaking API change after the initial release, we're bumping the major version to 1.0.0 to be good [semver](https://semver.org/) citizens.

The required change is to add a `mintingAgent` tag to the `NFTStorageMetaplexor` constructor that describes your project / application. See the README or SPEC.md for details.

Other changes include:

- Fixes to ESM bundling and packaging for browsers and nodejs modules [#28](https://github.com/nftstorage/metaplex-auth/pull/28)
- Updated the Metaplex NFT json schema to support the v1.1.0 token standard [#31](https://github.com/nftstorage/metaplex-auth/pull/31)

# 2021-12-02 - v0.2.3

The first public release, pre-dating CHANGELOG.md :)
