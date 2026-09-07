# Shifter website

Production source for https://shifter.co, linked to the Vercel project `shifter-co`.

## Check before release

```sh
npm ci
npm test
```

The build runs the same checks: page links, CSS/JavaScript/image/font dependencies, JSON-LD, sitemap targets and a local GET-only Snapshot endpoint check. No test email is sent.

`scripts/design-baseline.json` protects the working production design and runtime recovered on 8 September 2026: 70 assets and seven homepage sections. An intentional redesign requires separate approval and an explicitly reviewed baseline update. AEO edits do not authorize changing this baseline.

## Publishing

Automatic assignment of production domains is disabled in Vercel. Git pushes may produce staged builds, but must not replace shifter.co automatically.

1. Review and commit the complete source, including the `api/` directory and all linked assets.
2. Run the checks and build a staged production deployment.
3. Verify its actual HTTP assets, About/Method routes, Snapshot endpoint and appearance before manually promoting it.
4. After promotion, verify that `autoAssignCustomDomains` is still false. Promotion can change this setting.

Do not redeploy a copy scraped from the public website: it cannot contain the server-side Snapshot handler and may miss CSS or scripts.

Private hero experiments are not production source and must not be uploaded here. The current recovery intentionally retains the established live hero.

## AEO scope

The additions are entity metadata, About and Method pages, a matching disambiguation FAQ, footer links, sitemap entries and `llms.txt`. Unverified founding dates, new founder-history claims and an invented scoring formula have been omitted. Existing commercial terms are unchanged.

`APPLY-LOG.md` is the other agent's historical change log, retained for traceability and excluded from deployment.

## Verification limits

GET `/api/lead` returning 405 confirms that the backend is deployed, not that email delivery works. The inherited origin policy permits the production domains and explicitly configured preview deployments; a staged **production** deployment URL is not an allowed browser form origin. Do not loosen that policy just to test staging. End-to-end email delivery requires a separately authorized submission.
