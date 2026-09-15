/**
 * `GET /turn-credentials` response. `iceServers` is shaped to drop straight into a
 * `RTCPeerConnection` / PeerJS `config.iceServers`; TURN entries carry short-lived,
 * server-minted credentials. `ttl` is the credential lifetime in seconds.
 */
export interface IceServersResponse {
  iceServers: RTCIceServer[]
  ttl: number
}
