# Security

Mojavechain is a public testnet. tMOJAVE has no value, but we treat bugs in the cryptography as seriously as if it did.

## Reporting

Please report anything that lets someone forge a ring signature, spend an output twice, create value through a commitment or range proof, link a one-time output to a wallet, or open an ML-KEM payment without the receiver's key.

Open a private report through GitHub: **Security → Report a vulnerability** on this repository, or DM [@MojavechainL1](https://x.com/MojavechainL1).

Include the transaction or a script that reproduces the issue. `test/crypto.test.js` is a good starting point.

## Scope

- `client/rct.js`: every cryptographic construction (shared by the node and the wallet)
- `server/index.js`, `server/worker.js`: transaction acceptance, block production, faucet
- `client/wallet.html`: key generation, scanning and transaction building in the browser

## Known limits

- The testnet is produced by one node. Consensus rules are enforced, but there is no peer-to-peer network yet.
- Ring signatures and Pedersen commitments use ristretto255. Payment detection on `mjcq1` addresses uses ML-KEM-768; post-quantum spend proofs are the Faraday upgrade.
- Wallet seeds are stored in the browser's local storage. Back them up.
