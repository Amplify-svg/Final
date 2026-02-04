# Final

## Making Calls Work Across Networks ✅

Currently the app uses WebRTC for peer-to-peer calling. If calls only work on LAN but fail across the internet, the most common reasons are restrictive NATs/firewalls and the site not being served over HTTPS.

What to do:

1. Use a TURN server (relay) so peers behind restrictive NATs can connect. You can deploy your own using coturn or use a commercial provider (e.g., Xirsys). Set these environment variables for the server:

   - `TURN_URL` (comma-separated TURN URLs, e.g., `turn:turn.example.com:3478`)
   - `TURN_USERNAME` (username for TURN)
   - `TURN_CREDENTIAL` (password/credential for TURN)

   The server exposes `/ice-config` which returns `{ iceServers: [...] }`. The client will fetch this at runtime and use the TURN server if present.

2. Serve the site over HTTPS (getUserMedia and many browsers require HTTPS for camera/mic access unless on localhost). For quick testing across networks you can use a tunnel like `ngrok` (with TLS) or deploy to a host with a valid certificate.

3. For development, you can also use public TURN providers (some offer free tiers) but for production it's recommended to run your own or use a paid service.

---
