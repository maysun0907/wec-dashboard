"""External links per manufacturer — official racing pages and
social handles. Populated at API read time (not stored in the DB)
so editing this file + redeploying refreshes every page.

Keys are the canonical `Manufacturer.name` from our DB. Each value
is a dict where every URL field is optional — it's better to leave
a slot empty than to ship an outdated handle. Prefer the racing
sub-account ("Porsche Motorsport", "Cadillac Racing") over the
parent brand whenever it exists.

Source verification trail:
- Official websites are the FIA-listed motorsport URL from the
  fiawec.com/en/page/our-manufacturers grid.
- Socials cross-checked from each official racing landing page.
"""
from __future__ import annotations

from typing import TypedDict


class ManufacturerLinks(TypedDict, total=False):
    website_url: str
    youtube_url: str
    x_url: str
    instagram_url: str


MANUFACTURER_LINKS: dict[str, ManufacturerLinks] = {
    "Alpine": {
        "website_url": "https://www.alpinecars.fr/championnat-wec.html",
        "youtube_url": "https://www.youtube.com/@AlpineCarsOfficiel",
        "x_url": "https://x.com/AlpineCars",
        "instagram_url": "https://www.instagram.com/alpinecars/",
    },
    "Aston Martin": {
        "website_url": "https://www.astonmartin.com/en/racing/aston-martin-racing",
        "youtube_url": "https://www.youtube.com/@AstonMartin",
        "x_url": "https://x.com/AstonMartin",
        "instagram_url": "https://www.instagram.com/astonmartinlagonda/",
    },
    "BMW": {
        "website_url": "https://www.bmw-m.com/en/fastlane/motorsport/racing-series/fia-wec.html",
        "youtube_url": "https://www.youtube.com/@BMWMotorsport",
        "x_url": "https://x.com/BMWMotorsport",
        "instagram_url": "https://www.instagram.com/bmwmotorsport/",
    },
    "Cadillac": {
        "website_url": "https://www.cadillac.com/performance/racing",
        "youtube_url": "https://www.youtube.com/@CadillacRacing",
        "x_url": "https://x.com/CadillacRacing",
        "instagram_url": "https://www.instagram.com/cadillacracing/",
    },
    "Chevrolet": {
        # Corvette Racing is the WEC entry from Chevrolet
        "website_url": "https://corvetteracing.com/",
        "youtube_url": "https://www.youtube.com/@corvetteracing",
        "x_url": "https://x.com/CorvetteRacing",
        "instagram_url": "https://www.instagram.com/corvetteracing/",
    },
    "Ferrari": {
        "website_url": "https://www.ferrari.com/en-EN/competizioni-gt/fia-wec-world-endurance-championship",
        "youtube_url": "https://www.youtube.com/@Ferrari",
        "x_url": "https://x.com/FerrariHypercar",
        "instagram_url": "https://www.instagram.com/ferrarihypercar/",
    },
    "Ford": {
        "website_url": "https://www.fordracing.com/motorsport/sports-car-racing",
        "youtube_url": "https://www.youtube.com/@FordPerformance",
        "x_url": "https://x.com/FordPerformance",
        "instagram_url": "https://www.instagram.com/fordperformance/",
    },
    "Genesis": {
        # Genesis Magma Racing — South Korean Hypercar entrant from
        # 2026 (in partnership with Oreca Motorsport).
        "website_url": "https://www.genesis.com/worldwide/en/magma/motorsports/genesismagmaracing.html",
        "youtube_url": "https://www.youtube.com/@GenesisMagmaRacing",
        "x_url": "https://x.com/MagmaRacing",
        "instagram_url": "https://www.instagram.com/genesismagmaracing/",
    },
    "Lexus": {
        "website_url": "https://discoverlexus.com/stories/lexus-motorsport/world-endurance-championship/",
        "youtube_url": "https://www.youtube.com/@Lexus",
        "x_url": "https://x.com/Lexus",
        "instagram_url": "https://www.instagram.com/lexususa/",
    },
    "McLaren": {
        "website_url": "https://www.mclaren.com/racing/",
        "youtube_url": "https://www.youtube.com/@McLaren",
        "x_url": "https://x.com/McLarenF1",
        "instagram_url": "https://www.instagram.com/mclaren/",
    },
    "Mercedes-AMG": {
        "website_url": "https://www.mercedes-amg.com/en/gt-racing",
        "youtube_url": "https://www.youtube.com/@MercedesAMG",
        "x_url": "https://x.com/MercedesAMG",
        "instagram_url": "https://www.instagram.com/mercedesamg/",
    },
    "Peugeot": {
        "website_url": "https://peugeot-sport.com/endurance/",
        "youtube_url": "https://www.youtube.com/@PEUGEOTSPORT",
        "x_url": "https://x.com/peugeotsport",
        "instagram_url": "https://www.instagram.com/peugeotsport/",
    },
    "Porsche": {
        "website_url": "https://racing.porsche.com/series/wec",
        "youtube_url": "https://www.youtube.com/@PorscheMotorsport",
        "x_url": "https://x.com/PorscheRaces",
        "instagram_url": "https://www.instagram.com/porsche.motorsport/",
    },
    "Toyota": {
        "website_url": "https://toyota-racing.com/toyota-racing-wec/",
        "youtube_url": "https://www.youtube.com/@toyotagazooracing",
        "x_url": "https://x.com/Toyota_Hybrid",
        "instagram_url": "https://www.instagram.com/toyotagazooracing_wec/",
    },
}
