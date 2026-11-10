# site

The public marketing site. Static HTML, one stylesheet, one small script, no build step.

| File | What it is |
|---|---|
| `index.html` | the front page: threat, six primitives, one payment, comparison, specs, roadmap |
| `privacy.html` | how a transaction hides sender, receiver and amount, and the quantum gap |
| `token.html` | $MOJAVE vs tMOJAVE, emission, the disclosure that has to sit next to both |
| `mining.html` | Argon2id work, browser and CLI mining, rewards and maturity |
| `faq.html` | thirteen answers, including the ones about audits and mainnet timing |
| `404.html` | served for anything that is not a page |
| `site.css` | the whole design system, same tokens as the app |
| `site.js` | nav, reveal on scroll, live numbers |
| `img/` | mark, og image, banner and the 1 bit dither art |

## Live numbers

`site.js` fetches `/api/stats` and `/api/blocks?limit=1` on every page and fills the panels marked
`data-h`, `data-diff` and the rest. Served from the same origin as a node, the panels show the real
chain. Served anywhere else, the fetch fails quietly and the panel reads `node offline`, so a static
host never shows stale or invented numbers.

The nav and call to action link to `/wallet`, `/explorer`, `/mine`, `/docs` and `/whitepaper`. Those
are pages of the node, not of this folder, so the site expects to sit at the domain root with the
node behind the same host.

## Preview it

Start the node, then the preview server. The preview serves this folder and passes `/api` through to
whatever is listening on port 8266.

```bash
npm start                              # terminal one, the node
node _studio/site-preview.cjs 4400     # terminal two, the site
```

Then open http://localhost:4400. Without a node the pages still render, with `node offline` in the
panels.

## Deploy it

Any static host works. Point the publish directory at `site`, keep the paths as they are, and route
the API and the app pages (`/wallet`, `/explorer`, `/mine`, `/docs`, `/whitepaper`, `/api/*`) to the
node. On a host with no rewrite rules, `404.html` is picked up automatically as the not found page.

## Change it

Colours, type, spacing and components live at the top of `site.css`. The dither art in `img/` is
generated, not drawn by hand:

```bash
node _studio/dither.cjs     # rewrites dither-mark, dither-band and dither-sky from brand/logo
```

Fonts are Archivo and Geist Mono from Google Fonts. Self host them if the page should not call a
third party.
