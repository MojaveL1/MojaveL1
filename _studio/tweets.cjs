// Writes brand/X-KIT.md; every tweet must be ≤245 characters.  node _studio/tweets.cjs
'use strict';
const fs = require('fs'), path = require('path');
const len = (t) => [...t].reduce((a, c) => a + (c.codePointAt(0) > 0x10ff ? 2 : 1), 0);
const BIO = 'Private money for the quantum era. Ring signatures, stealth addresses, hidden amounts, ML-KEM-768. Private today. Private after quantum. $MOJAVE';
const T = [
  ['Pinned', 'mojave-hype-16s.mp4', `Every public chain turns your money into a diary anyone can read.

Mojavechain hides the sender in a ring of 16, the receiver behind a one-time address, the amount inside a commitment.

Private today. Private after quantum.

$MOJAVE`],
  ['Ring signatures (video)', 'mojave-ring-16s.mp4', `You spend one coin. You sign with sixteen.

Every Mojave input signs alongside 15 decoys pulled from the chain. The signature proves one is yours, never which.

A key image makes spending it twice impossible.

$MOJAVE`],
  ['Quantum (video)', 'mojave-quantum-16s.mp4', `Quantum computers break elliptic curves.

Pay a mjcq1 address on Mojavechain and the payment is found with ML-KEM-768: a 1,088-byte ciphertext only the receiver can open.

Live on testnet today.

$MOJAVE`],
  ['Anatomy', 'mojave-g01-anatomy.png', `Anatomy of a Mojave transaction:

sender → ring of 16
receiver → one-time stealth address
amount → Pedersen commitment + range proof
double spend → key image
quantum receive → ML-KEM-768

What the chain sees: nothing useful.`],
  ['Faraday', 'mojave-g02-faraday.png', `Faraday is the Mojave quantum upgrade.

Spends move to hash-based proofs. Every spend hides in the full chain, not 16 outputs. Payment detection is ML-KEM-768 only.

Same chain. No new coin. The wallet moves you once.

$MOJAVE`],
  ['Ring', 'mojave-g03-ring.png', `One of these 16 is the real spend.

Nobody watching the chain can tell which. Not exchanges, not trackers, not the node that mined it.

That's every input, on every Mojave transaction, by default.

$MOJAVE`],
  ['Quantum addresses', 'mojave-g04-quantum.png', `Two addresses, one wallet.

mjc1: classic ECDH payment detection
mjcq1: ML-KEM-768, the NIST post-quantum standard

Share the mjcq1 address and your incoming payments stay private even against a quantum computer.

$MOJAVE`],
  ['Spec sheet', 'mojave-g05-specs.png', `Mojavechain spec sheet:

Argon2id proof of work (memory-hard)
30s blocks
~100M supply + 2.0/block tail
MLSAG ring signatures, ring of 16
Pedersen commitments + 48-bit range proofs
ML-KEM-768 quantum addresses

$MOJAVE`],
  ['Roadmap', 'mojave-g06-roadmap.png', `Mojavechain roadmap:

✓ testnet live: explorer, browser wallet, faucet
✓ $MOJAVE launch
→ open mining with Argon2id
→ Faraday: hash-based spends, full-chain privacy
→ mainnet with Faraday from block 1`],
  ['Where Mojave sits', 'mojave-g07-vs.png', `Transparent chains hide nothing.
Classic privacy coins hide sender, receiver and amount, then stop.

Mojave hides all three, detects payments with ML-KEM-768, and has a path to fully quantum-safe spends.

$MOJAVE`],
  ['Try it', 'mojave-keyart.png', `Try a private transaction in under a minute:

1. Open the Mojave wallet, keys made in your browser
2. Take 25 tMOJAVE from the faucet
3. Send to any mjc1 or mjcq1 address

Your browser builds the ring signature. The chain sees nothing.`],
  ['Vs private chains', 'mojave-g08-vs-privacy.png', `Mojave vs the private chains:

Zcash: privacy is opt-in
Monero: private by default, curves underneath
NOID: hash-based ownership proofs, nothing shielded

Mojave: private by default, ML-KEM-768 quantum receive, hash-based spends next.

$MOJAVE`],
  ['Launch (fill CA)', 'mojave-keyart.png', `$MOJAVE is live.

Mojavechain: private money for the quantum era. Ring signatures, stealth addresses, hidden amounts, ML-KEM-768.

CA: <paste CA>`],
];
let md = `# Mojavechain X kit\n\n## Handle\n\`\`\`\n@MojavechainL1\n\`\`\`\n\n## Display name\n\`\`\`\nMojavechain | $MOJAVE\n\`\`\`\n\n## Bio (${len(BIO)}/160)\n\`\`\`\n${BIO}\n\`\`\`\n\n## Profile images\n- Avatar: \`mojave-pfp.png\`\n- Header: \`mojave-banner.png\`\n\n## Tweets (all ≤245)\n`;
let bad = 0; T.forEach(([title, media, text], i) => { const n = len(text); if (n > 245) { bad++; console.log('TOO LONG', title, n); } md += `\n### ${i + 1}. ${title} · ${n} chars · media: \`${media}\`\n\`\`\`\n${text}\n\`\`\`\n`; console.log(String(n).padStart(4), title); });
if (len(BIO) > 160) { bad++; console.log('BIO TOO LONG', len(BIO)); }
fs.writeFileSync(path.join(__dirname, '..', 'brand', 'X-KIT.md'), md); process.exit(bad ? 1 : 0);
