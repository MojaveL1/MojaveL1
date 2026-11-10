# Mojavechain: private money for the quantum era

Mojavechain whitepaper, version 0.1 (testnet), November 2026

## Abstract

Mojavechain is a proof-of-work chain where every transaction is private by default. The sender hides in a ring of 16, the receiver behind a one-time stealth address, and the amount inside a Pedersen commitment with a range proof. Payments to quantum addresses (mjcq1) are detected with ML-KEM-768, the NIST post-quantum key encapsulation standard. The Faraday upgrade moves spends to hash-based proofs over the whole chain, so the last elliptic-curve dependency goes too. The testnet is live, and every rule in this paper is in the public repository and covered by its test suite.

## 1. The problem

Public chains publish who paid whom and how much, forever. Anyone can follow a wallet, cluster its addresses and read its history. Privacy coins solved part of this with elliptic-curve cryptography, but a large enough quantum computer breaks elliptic curves. Data recorded today can be unmasked later. Mojave is built so that what is private today stays private after quantum.

## 2. Design goals

- Private by default. No transparent mode, no opt-in.
- Hide all three: sender, receiver and amount.
- Post-quantum where it matters first: payment detection, which is what links payments to a person.
- A clear path to fully post-quantum spends without a new coin.
- Anyone can verify every transaction without trusting a node.

## 3. Keys and addresses

A wallet is one 32-byte seed. From it the wallet derives a spend key and a view key (scalars on ristretto255) and an ML-KEM-768 key pair. Each wallet has two addresses:

```
mjc1...   classic: spend public key + view public key
mjcq1...  quantum: the same keys + an ML-KEM-768 public key
```

Both receive into the same wallet. Keys are created in the browser and never leave the device.

## 4. Stealth outputs

Nobody pays an address directly. For each payment the sender derives a fresh one-time key:

```
P = Hs(shared_secret, i)*G + A
```

On mjc1 addresses the shared secret comes from ECDH with the receiver's view key. On mjcq1 addresses it comes from ML-KEM-768 encapsulation, and the 1,088-byte ciphertext travels with the output. The receiver scans each output with the view key or the ML-KEM secret key. To everyone else, two payments to the same wallet look unrelated.

## 5. Hidden amounts

Each amount is a Pedersen commitment:

```
C = x*G + v*H
```

The blinding factor x and the amount v are encrypted to the receiver. Every output carries a 48-bit range proof: 48 bit commitments, each with a 2-member ring signature proving it opens to 0 or to 2^j. This blocks inflation through negative amounts. A transaction balances when:

```
sum(pseudo-input commitments) = sum(output commitments) + fee*H
```

## 6. Ring signatures and key images

Each input references 16 outputs from the chain: the real one and 15 decoys. A two-row MLSAG signature proves the signer owns one of the 16 one-time keys and that its commitment matches the pseudo-input, without revealing which. The signature publishes a key image:

```
I = x*Hp(P)
```

One output always gives the same key image, so a second spend is rejected, but nothing links the key image back to the output.

The 15 decoys are not drawn uniformly. Real spends cluster in recent outputs, so an even spread across the chain would mark the ring as synthetic. Members inside the newest 15% of the chain carry six times the weight of older ones, which has the same effect as the gamma distribution the Monero research lab recommends for output selection. Outputs younger than three blocks are never used.

## 7. Consensus

- Proof of work: Argon2id, memory-hard, so mining favours ordinary CPUs over specialised hardware.
- A block is valid when argon2id(header | nonce) * difficulty < 2^256.
- Difficulty retargets every block toward a 30-second block time.
- An output can be spent, or used as a decoy, only after 3 confirmations. The rule is checked on all 16 ring members, since the node cannot see which one is real.
- The mempool holds 200 transactions, ordered by fee per byte. A full pool drops its cheapest.

## 8. Emission

- Main emission: about 100,000,000 MOJAVE.
- Block reward: (100M - emitted) / 2^19, a smooth curve that falls each block.
- Tail emission: 2.0 MOJAVE per block, forever, so miners are always paid to secure the chain.

## 9. Verification without trust

Every transaction in the explorer has a "verify in your browser" button. The browser fetches the transaction and its ring members from /api/rawtx/:id and runs the same verifyTx the node runs: every ring signature, every range proof and the commitment balance. The code is open source, and the test suite runs on every push via GitHub Actions. It covers private sends to mjcq1 addresses, rejection of double spends and rejection of forged signatures.

Cryptography comes from the audited noble libraries: @noble/curves (ristretto255), @noble/hashes (SHA-512, SHA3-256) and @noble/post-quantum (ML-KEM-768). Argon2id is Node's built-in implementation.

## 10. Faraday: the quantum upgrade

ML-KEM payment detection is live today. Faraday finishes the job:

1. Spends move from elliptic-curve ring signatures to hash-based proofs.
2. The anonymity set grows from 16 outputs to the whole chain.
3. Payment detection becomes ML-KEM-768 only.

It is the same chain with no new coin. Each wallet migrates its coins once, automatically.

## 11. $MOJAVE

$MOJAVE is the Solana token that funds development and carries the community to mainnet. tMOJAVE is the testnet coin, free from the faucet, used to test every feature before mainnet.

## 12. Roadmap

- Done: testnet live with explorer, browser wallet and faucet
- Done: $MOJAVE launch
- Done: open mining with Argon2id (browser miner at /mine, CLI miner in miner/)
- Next: Faraday, hash-based spends and full-chain privacy
- Then: mainnet with Faraday from block 1

## Links

- Testnet, explorer and wallet: https://mojavechain.org
- Docs: https://mojavechain.org/docs
- Code: https://github.com/MojaveL1/MojaveL1
- X: https://x.com/MojavechainL1
