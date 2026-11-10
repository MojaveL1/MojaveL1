# Changelog

All notable changes to Mojavechain are recorded here.

## Unreleased

- Maturity is now a consensus rule: `vetRing` checks all 16 ring members, so an
  output younger than 3 blocks can be neither spent nor used as a decoy. Before
  this only the wallet filtered spendable outputs.
- Decoys are weighted toward recent outputs (newest 15% of the chain at 6x), and
  immature outputs are not eligible for a ring.
- The mempool is ordered by fee per byte instead of arrival, and a full pool (200)
  drops its cheapest transaction. The rate is kept off the serialised tx.
- Tests: 41 assertions, including a mutation suite (rotated ring, borrowed pseudo
  input, flipped scalar, rewritten bit commitment, short range proof, negative fee).
- The old repository URL was still in the docs, the site footer and the whitepaper
  builder. Every link now points at this repository.

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
