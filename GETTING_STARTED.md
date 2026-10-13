# PoGo Bag Tracker

Unofficial visual Pokémon GO Item Bag companion. This is an **early reviewable MVP**, not a finished inventory scanner.

## Included

- Three independent accounts with bag capacity, optional game-reported count, and editable item quantities.
- Switchable list/grid views and category/name filtering.
- Dashboard showing storage status, category donut, biggest space users, and cross-account comparison.
- Cleanup planning with customizable keep targets. Rare items are protected from recommendations.
- Experimental client-side screenshot OCR using Tesseract.js, with explicit review and approval before quantities are saved.
- Local browser storage, JSON backup and restore, and responsive light/dark design.

## Important limitations

- Not connected to Pokémon GO. Quantities must be entered manually or reviewed after OCR; no live synchronization.
- OCR is a proof of concept. Some Pokémon GO screenshots will not parse correctly. It recognizes English item names only and may miss cropped or differently arranged counts.
- The starter item catalog is incomplete and should be audited against in-game data before relying on complete totals.
- Emoji are temporary placeholders for game item sprites; licensed or original icons can be added later.
- Data is stored on each browser separately; there is no cross-device sync. Export regular backups.
- Game-reported counts take precedence for estimated available slots; mismatches are shown as warnings.
- No Pokémon GO credentials are needed. Not affiliated with Niantic or The Pokémon Company.

## Publishing

From GitHub repository Settings → Pages, choose **Deploy from a branch** and select the branch you want to publish, folder **/ (root)**. Initially, you can deploy `feature/initial-app` for review without merging.

Expected Pages address once enabled: https://gwynmarsh.github.io/PoGo-Bag/

## Local use

Serve the directory through any static file server, or open `index.html` directly. No build tools required.

## Next improvements

1. Verify every inventory item and bag-capacity exemption.
2. Test screenshots from actual Pokémon GO Item Bags and improve image parsing.
3. Add proper icon assets with redistribution rights.
4. Introduce IndexedDB and service worker/offline installation.
5. Add automated browser tests and optional account synchronization.
