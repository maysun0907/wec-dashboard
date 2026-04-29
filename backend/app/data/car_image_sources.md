# Car image sources — 2026 WEC Hypercar

Manufacturer media centers for each model running in WEC 2026 Hypercar.
The workflow is manual: visit the URL, pick a 3/4-front shot, save it,
then run `python -m app.fetch_car_image <slug> <url>` to drop a
background-removed copy into `frontend/public/cars/{slug}.png`. If the
URL can't be hot-linked (most press portals can't), download to a temp
file and pass `file://...` as the URL — `httpx` handles file URIs.

Most portals gate the high-res originals behind a free media-account
registration; the web-res images embedded on article pages are usually
saveable via right-click as a fallback.

| Model | Slug | Portal | Public? |
| --- | --- | --- | --- |
| Ferrari 499P | `ferrari-499p` | [media-gallery](https://www.ferrari.com/en-EN/corporate/media-gallery) · [499P landing](https://www.ferrari.com/en-EN/hypercar/ferrari-499p) | browsing public, hi-res login |
| Toyota GR010 Hybrid | `toyota-gr010-hybrid` | [TGR releases](https://toyotagazooracing.com/release/) · [Toyota UK Media](https://media.toyota.co.uk/) | hi-res download buttons inline, no login |
| Cadillac V-Series.R | `cadillac-v-series-r` | [GM News](https://news.gm.com/) · [Cadillac Europe](https://news.cadillaceurope.com/en/cadillac/newsroom.html) · [livery reveal](https://news.cadillaceurope.com/en/cadillac/newsroom.detail.html/Pages/news/eur/en/cadillac/2025/01-13-Grand-Reveal-of-the-2025-Cadillac-Livery.html) | browsing public, hi-res login |
| BMW M Hybrid V8 | `bmw-m-hybrid-v8` | [BMW PressClub Motorsport](https://www.press.bmwgroup.com/global/article/topic/10849/bmw-motorsport) · [media guide](https://www.press.bmwgroup.com/global/article/detail/T0407839EN/bmw-m-hybrid-v8:-bmw-m-motorsport-media-guide) | browsing public, hi-res login |
| Alpine A424 | `alpine-a424` | [media.alpinecars.com](https://media.alpinecars.com/) · [reveal post](https://media.alpinecars.com/a424-v-alpine-reveals-its-future-hypercar-for-endurance-racings-premier-category/) | inline hi-res JPGs, no login |
| Peugeot 9X8 | `peugeot-9x8` | [Stellantis 9X8](https://www.media.stellantis.com/uk-en/peugeot/9x8) · [Peugeot Sport](https://peugeot-sport.com/) · [2026 livery](https://peugeot-sport.com/en/2026/02/26/the-peugeot-9x8-has-a-striking-new-livery-for-2026-a-tribute-to-performance-and-peugeots-gti-marque/) | browsing public, hi-res login (Stellantis); inline JPGs (peugeot-sport.com) |
| Aston Martin Valkyrie AMR-LMH | `aston-martin-valkyrie-amr-lmh` | [media.astonmartin.com/valkyrie](https://media.astonmartin.com/valkyrie/) · [track debut](https://media.astonmartin.com/aston-martin-valkyrie-amr-lmh-hypercar-hits-the-track/) | release pages embed web-res JPGs |
| Genesis GMR-001 | `genesis-gmr-001` | [Genesis Newsroom](https://newsroom.genesis.com/genesis-magma-racing-reveals-gmr-001-hypercar-for-2026-fia-wec-season/) · [Hyundai Motorsport reveal](https://motorsport.hyundai.com/media-center/news/2026/wec/reveal-of-gmr-001-hypercar-for-2026-fia-wec-season) | inline downloadable JPGs (Hyundai Motorsport) |

Porsche 963 is **not** on the 2026 WEC entry list — works program
withdrew, no customer entries listed (per Autosport / The Race
reporting, late 2025).

## Best no-login sources in practice
- `media.alpinecars.com`
- `motorsport.hyundai.com`
- `peugeot-sport.com`
- `toyotagazooracing.com`

These tend to expose downloadable JPGs directly on article pages.

## License notes
All sources are editorial-use only with manufacturer credit. Don't use
on commercial/merch projects. WEC fan-dashboard usage falls under
editorial.
