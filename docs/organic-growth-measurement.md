# Organic growth measurement

Use a rolling 28-day window and compare it with the preceding 28 days. This
keeps race-weekend spikes visible without letting a single event decide whether
the site is improving.

## Primary outcomes

| Metric | Source | Why it matters |
| --- | --- | --- |
| Organic clicks | Google Search Console | The clearest measure of search traffic delivered to the site. |
| Non-brand organic clicks | Search Console query export | Shows growth beyond searches that already contain `wecdash`. |
| Search impressions | Google Search Console | An early signal that new season and entity pages are gaining visibility. |
| Indexed canonical pages | Google Search Console | Confirms that locale and season URLs are being selected as intended. |

## Quality guardrails

| Metric | Source | Review threshold |
| --- | --- | --- |
| LCP | Vercel Speed Insights | At least 75% of visits at or below 2.5 seconds. |
| INP | Vercel Speed Insights | At least 75% of visits at or below 200 milliseconds. |
| CLS | Vercel Speed Insights | At least 75% of visits at or below 0.1. |
| 404 and redirect growth | Search Console Pages report | Investigate any sustained increase after a release. |

Vercel Analytics page views remain the traffic baseline. The site also records
privacy-safe interaction events for locale changes, season changes, and search
result selections. Search events include only the entity type; names and query
text are deliberately excluded.

## Weekly review

1. Compare organic clicks, impressions, click-through rate, and average
   position for the last 28 days with the previous period.
2. Split results by `/en/` and `/ko/`, then by schedule, standings, Genesis,
   and detail-page groups.
3. Inspect pages with rising impressions but below-site-average click-through
   rate; improve their title and description before creating more pages.
4. Check Core Web Vitals by route and device. Treat a regression on the home,
   races, standings, or Genesis pages as a release issue.
5. Review excluded URLs in Search Console. Redirects, valid canonicals, and
   retired 404s are expected; canonical locale and season pages are not.

## Release checks

- Every indexable page has a self-referencing canonical URL.
- English and Korean pages publish reciprocal `hreflang` links plus
  `x-default`.
- The sitemap contains canonical public URLs only.
- Titles and descriptions are unique for the page intent and season.
- New automated copy is based only on validated source fields.
