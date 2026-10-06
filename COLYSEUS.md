# Colyseus SDK

Runtime dependency: `@colyseus/sdk` 0.18.5, compatible with Colyseus 0.18 servers.

`pnpm sync:colyseus` copies the official npm browser bundle to the existing Cocos
asset path and generates a declaration bridge to the pinned SDK types. Existing
Cocos asset UUIDs remain unchanged. `pnpm build` performs this sync automatically.

The SDK selects fetch when available and falls back to XMLHttpRequest. The small
`scripts/colyseus-headers.js` compatibility shim supplies the Headers surface used
by JSON matchmaking when the runtime does not provide it. It does not replace an
existing Headers implementation. The official SDK bundle retains its MIT notice.

ColyseusSdk disables the SDK's new automatic reconnection loop because connection
policy belongs to the framework. Room disposal uses the SDK's consented leave API.

In the containing scaffold, `pnpm client:test` checks this exact runtime bundle
against the server over HTTP/WebSocket, with both fetch and XHR environments.
Creator Native and physical WeChat device validation remain separate checks.
