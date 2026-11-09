# Changelog

All notable changes to Mojavechain are recorded here.

## 0.1.0 — testnet

Initial public testnet.

- Private transactions: MLSAG ring signatures over a ring of 16, one-time stealth
  addresses, Pedersen commitments with 48-bit range proofs, and key images for
  double-spend rejection.
- Quantum receive: `mjcq1` addresses carry an ML-KEM-768 public key; senders
  encapsulate a fresh secret per payment and the 1,088-byte ciphertext rides with
  the output.
- Addresses: `mjc1` (classic, 97 characters) and `mjcq1` (quantum, ~1,715 characters).
- Consensus: Argon2id proof of work, 8 MiB memory, 30 s target block time,
  difficulty retargeted every block, three-block coinbase maturity.
- Emission: `(100,000,000 − emitted) / 2^19` per block with a 2.0 tail forever.
- Node, block explorer, browser wallet, faucet and CLI miner in one process.
- Explorers verify every transaction in the browser rather than trusting the node.
