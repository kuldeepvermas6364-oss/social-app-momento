# Momento — AT Protocol Social App

Momento is an independent social app fork based on the open-source Bluesky
Social client. It is built with React Native and the AT Protocol.

Momento is not published, endorsed, or operated by Bluesky Social PBC. The
current client defaults to the existing Bluesky-hosted AT Protocol services;
using the Momento brand does not create a separate PDS or independent social
network by itself.

## Development

This is a React Native application written in TypeScript. It builds on the
open-source `atproto` TypeScript packages, maintained in the
[AT Protocol repository](https://github.com/bluesky-social/atproto).

The `bskyweb/` directory contains the Go service used to serve the web
application in production.

See the [Build Instructions](./docs/build.md) to install dependencies, run the
web client, generate the Android project, and build a device-test APK.

## AT Protocol resources

- [AT Protocol overview and guides](https://atproto.com/guides/overview)
- [AT Protocol specifications](https://atproto.com/specs/atp)
- [AT Protocol source code](https://github.com/bluesky-social/atproto)

The app uses AT Protocol Lexicons in the `app.bsky.*` and `chat.bsky.*`
namespaces for interoperability with the existing network.

## Project identity

- App display name: **Momento**
- Android application ID: `com.kuldeep.momento`
- Expo slug: `momento`
- Deep-link scheme: `momento://`

The Android GitHub Actions workflow produces a debug-signed APK for device
testing. A production Google Play release requires a separately configured
release signing key and store submission credentials.

## License and upstream attribution

The source code remains subject to the license files included in this
repository. Third-party assets and upstream trademarks have separate
licensing terms; see [ASSETS.md](./ASSETS.md) before redistributing any asset.
