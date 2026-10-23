# Vector Jobs

Open **Jobs** in the product navigation. Defaults are **U.S. + remote**, **internships + new grad / entry level**, the **Fortune 500 & big names** tab and **Source posted · newest first**. Use the sort menu for oldest-first or recently detected. Unknown posting dates sort last in both directions.

Tick **Applied** after finishing an application. Bookmarks and application status are independent and persist across refreshes, source removal and duplicate consolidation. Unticking Applied retains the bookmark. Vector does not submit applications.

## Company tabs

The three default views are **Fortune 500 & big names**, **YC & established**, and **Smaller startups**. Big-name membership takes precedence over YC membership, so each job appears in one view. Counts respect the other current filters.

`lib/job-company-catalog.json` contains public 2026 Fortune 500 company names and a curated set of verified YC profiles, with references and the check date. `lib/job-companies.ts` adds curated recognizable employers and established/growth companies and normalizes known name variants. These groups are navigation preferences, not endorsements or exhaustive funding/size classifications. Unclassified companies appear in Smaller startups and explicitly say their size is unverified. Open a job card's company-group details to move that company; the override applies across its jobs. Choose Automatic grouping to reset it.

## Background matching and posting dates

Every backend refresh runs the reconciliation pipeline after updating source snapshots. The existing hourly background task uses the same writer, so reconciliation also runs while Vector is closed. The open Jobs tab refreshes due sources as before; no additional account or paid matching service is required.

Matches require a shared canonical employer application URL or employer-scoped ATS requisition ID. Common Greenhouse embedded IDs, Lever apply links, Ashby application links, Workday requisitions, Workable and SmartRecruiters IDs and supported Amazon/Apple/Google job IDs are normalized. Known company-name aliases are applied. Identical titles alone never confirm a match: different requisitions stay separate, with similar-role hints where appropriate. Opaque Jobright links remain separate unless their employer identity is independently available in the imported records. The pipeline does not crawl signed-in/private job pages.

For each verified job, the pipeline retains the earliest reported posting date across sources and refresh history. A later repost date or disappearing source cannot overwrite earlier evidence. Day-only dates stay day-only. Relative ages such as “2d” are estimates and never become confirmed dates. Yearless community dates use a bounded recent-year inference, are labeled as such, and cannot establish confirmation on their own. Update timestamps, Lever creation timestamps and Vector detection timestamps are excluded.

**Confirmed posted** means a cross-source job identity is verified and explicit posting-date evidence is available from an employer feed or at least two reporting sources; the selected earliest date must not depend on an inferred year. It is the earliest supported source date, not proof of the first-ever publication anywhere. A single uncorroborated listing displays **Source posted**. Expand **Source & date details** or **Verified job match** for the evidence links, dates and match reason.

The index is published in a transactional D1 batch in bounded chunks. Saved/applied marks refer to stable IDs and aliases so merging duplicates does not reset progress. Removed listings' date history is retained for 180 days, with up to 10,000 archived groups; saved application snapshots are retained separately. Failed source reads preserve old snapshots. Parser upgrades force a fresh compatible read rather than retaining old parser output via HTTP 304.

## Sources and coverage

The initial set is 24 monitored sources: 18 direct company boards and six public community lists. This does not cover every company or every job board.

- Greenhouse: Stripe, Cloudflare, Databricks, Airbnb, Robinhood, Roblox, Figma, Discord, Lyft and Duolingo.
- Ashby: OpenAI, Notion, Ramp, Linear and Vanta.
- Lever: Palantir, Zoox and Spotify; all pages are read within the bounded import limit.
- Simplify: Summer 2027 Internships and New Grad Positions, including their software and data categories.
- Jobright: its public 2026 Software Engineer and Data Analysis internship/new-grad GitHub lists. These are rolling lists maintained by Jobright, separate from its website search; their year and scope are shown through source attribution.

**Sources → Monitor board** accepts a direct Greenhouse, Lever or Ashby company careers URL. The server constructs a fixed, trusted API URL. Arbitrary URLs, private networks, credentials, alternate ports and redirects are rejected. Pause sources individually. The personal deployment supports up to 100 sources.

LinkedIn is an external search link. Its signed-in pages are not scraped. Jobright's website search is also an external link; there is no verified public website-search API configured.

## Freshness and limits

Direct boards target one-minute polling. Community lists target five minutes, since their upstream lists update separately. Jobs checks due sources every 15 seconds while VECTOR is visible (including Overview and Mail Lab), and immediately on returning to the browser tab. The oldest due sources run first, with direct feeds breaking ties; community lists cannot be starved by a growing set of employer feeds. Existing saved source settings migrate to the shorter cadence; active error backoff is preserved. Background scheduling is independent: the interface reports a configured schedule only after its real task ID and cadence have been saved. A scheduled task being enabled does not prove every run succeeded; inspect source timestamps and errors.

Each invocation reads at most eight due sources with up to two concurrent downloads. Batches containing Ashby feeds run serially because the responses contain full descriptions. Responses are capped at 16 MiB, each source download has a 20-second deadline, and a batch has a 40-request budget. Repeat up to four invocations per scheduled run while `remainingDue` is positive. Larger custom source sets may need additional runs. Feed delays, retries, source rate limits, task scheduling and changed source formats can increase detection time. There is no guarantee of instantaneous publication or universal coverage.

The current Sites task scheduler allows at most one run per hour. Five-minute unattended checks require a separate scheduler/worker; one-minute direct-board checks while VECTOR is visible do not need that extra infrastructure.

Sources support conditional HTTP requests when supplied, bounded response sizes, timeouts and retry backoff. Redirects are rejected. Failed imports preserve the previous snapshot and display the source error. Successful empty feeds remove unsaved listings. Saved/applied jobs survive removal and are marked as missing from the latest feed.

“Detected” is when Vector first saw a URL. “First imported” identifies the initial snapshot; neither means the employer just posted it. Actual source posting time is displayed only when explicitly supplied. Greenhouse update times and Lever creation times are not treated as posting times. Community date/age strings remain attributed to their source. Canonical URLs and verified employer requisition IDs consolidate matching listings; different requisitions remain separate.

Experience tags use titles, employer internship employment types, explicit internship/new-graduate wording in descriptions, and curated list scope. Senior titles override internship metadata. Generic titles on direct boards are available under **All experience**. Location matching uses listing text. **U.S. + remote** includes remotely listed roles; employers may impose country or work-authorization restrictions. Always check the original requirements.

## Storage and unattended updates

`life_records` holds one bounded snapshot per `job_source`, retained `job_mark` records and `job_control` metadata, plus a chunked `job_index` of reconciled listings. No new database or paid API key is required. Jobs snapshots are excluded from dashboard state, workspace exports and personal assistant context. No Google credentials are used for job feeds.

The hosted Site must stay owner-private. Sites dispatch authenticates service access before forwarding requests. `/api/jobs` additionally requires the signed-in user and same-origin browser mutations. `/api/jobs/sync` is a public-feed-only service writer behind that private platform boundary; `GET` updates due feeds, `GET ?status=1` reads counts/source health, and `POST` records the actual background task metadata. Do not expose these service routes on an unauthenticated public host.

The hosted MCP tool `refresh_job_feed` invokes the same writer. Scheduled runs should refresh due sources, repeat while `remainingDue > 0` up to four calls, and report errors without clearing snapshots. They must not apply to jobs, send messages, modify Google data, or republish code. Run verification through the Site's supported service access and read status back after the write. A self-contained task can call the writer at the linked Site URL without needing a Google connection or installed personal-data tool.

## Validation

`node scripts/test-jobs.mjs` uses isolated SQLite fixtures to cover all five parsers, closed/unlisted filtering, title/location classification, safe source URLs, canonical deduplication, timestamps, conditional refresh, first-seen retention, failure preservation, saved/applied retention, Lever pagination, poll locking, authentication and origin checks, employer-ID matching, ambiguity separation, posting-date history, source expiry, independent Saved/Applied state and company overrides.

Source documentation:

- [Greenhouse Job Board API](https://docs.greenhouse.io/job-board.html)
- [Lever Postings API](https://github.com/lever/postings-api)
- [Ashby public posting API](https://developers.ashbyhq.com/docs/public-job-posting-api)
- [Simplify internships](https://github.com/SimplifyJobs/Summer2027-Internships) and [new grad](https://github.com/SimplifyJobs/New-Grad-Positions)
- [Jobright public new-grad list](https://github.com/jobright-ai/2026-Software-Engineer-New-Grad)
- [LinkedIn scraping policy](https://www.linkedin.com/help/linkedin/answer/a1341387/prohibition-of-scraping-software?intendedLocale=en&lang=en-us)

Company references: [2026 Fortune 500](https://fortune.com/ranking/fortune500/) and the [official YC directory](https://www.ycombinator.com/companies). The catalog includes each verified YC profile URL.

## Source time and detection speed

Cards and date evidence show a source-supplied timestamp down to seconds in America/Los_Angeles (PDT/PST). Day-only evidence stays a date and explicitly says time unavailable. An initial bulk import is never presented as proof of fast detection. For subsequent discoveries with an exact source timestamp, the card reports observed elapsed time from that timestamp to VECTOR’s first observation; this is historical evidence, not a delivery guarantee or a Simplify benchmark. Ashby’s `publishedAt` is the last publication time; it can represent a repost, so earlier verified evidence is retained by reconciliation.

When a Greenhouse list omits `first_published`, bounded public per-job lookups enrich up to three missing timestamps per board check, prioritizing unseen and early-career roles. Previously fetched timestamps are reused. Undated lookup attempts are retried at most daily, and detail-level 429s respect Retry-After. A failed optional date lookup never suppresses a newly found listing. Updates and internal creation times are still not substituted for publication times. Some current Greenhouse list responses already supply first_published directly; a live Figma feed verified that case.

The **Source posted · past hour** filter includes only exact, source-reported timestamps in the last hour; unknown/day-only dates are excluded. LinkedIn’s external shortcut uses `f_TPR=r3600&sortBy=DD`; this is an undocumented URL convention, not a monitored source, guaranteed filter contract, or source of instant notifications. Instagram profile/stories could not be accessed in this session, so no story links or speed claims were verified. The Instagram link is external. Paste an actual Greenhouse, Ashby or Lever application destination into Monitor board to monitor the company directly; allowlisted Instagram link wrappers and Greenhouse embed links are safely normalized. Arbitrary redirects and unsupported hosts remain rejected.

The owner-private Sites schedule remains hourly when Jobs is closed. Achieving minute-level unattended checks requires a separately authorized always-on worker/scheduler and secure access to the private service. There is no seconds-after-publication or faster-than-Simplify promise; upstream visibility, polling, provider limits and retries determine actual delay.

Graduate-only eligibility: Jobs excludes postings with explicit master's, PhD/doctoral, MBA, or graduate-school enrollment requirements. New-grad bachelor's roles, optional/preferred advanced degrees, and bachelor's/equivalent-experience alternatives remain eligible. Direct employer descriptions are inspected during source refresh (Greenhouse requests `content=true`; Lever/Ashby supply descriptions). Community-only listings without descriptions are checked by title until matching employer evidence is available. The same filter applies to feed statistics and Summaries counts; saved application records remain stored.

## Discovery and search improvements

Automatic board discovery is enabled by default. Each refresh inspects existing enabled Simplify/Jobright snapshots for U.S./remote early-career roles and extracts Greenhouse, Lever or Ashby boards from their actual application links. It does not guess board tokens from company names or crawl arbitrary company websites. At most 24 discovered boards (and 100 total sources) are retained. Discovered sources are marked in Sources and checked through the same bounded, rate-limited feed importer. Initial board imports are baseline data, not newly posted alerts. Paused boards are never re-enabled by discovery. Switch off discovery in Sources to stop adding boards; pause existing sources separately. Discovery uses previously imported snapshots, so a company can be discovered on the check after its community listing arrives.

Search matches all entered words across company, title and location in any order. For example, `Figma software` matches Figma's Software Engineer roles. Broader technical title recognition includes data, infrastructure, QA/test and site-reliability engineers and applied scientists. Existing company tabs, location/experience filters, graduate-only exclusions, and verified-requisition deduplication still apply. Generic roles without clear early-career evidence remain under All experience; no unsupported eligibility assumptions are made.

As sources increase, the bounded request budget and batch cadence may exceed the one-minute target. The hourly unattended schedule remains unchanged; this update does not guarantee second-level monitoring or add LinkedIn scraping.

Large Greenhouse boards that exceed the 16 MiB full-description limit fall back to the compact public listing feed. Up to three individual public job descriptions are checked per board refresh, with early-career roles first; unchecked listings are held out of results and counts until their education checks finish. Sources shows the queued-description count. Successful checks are reused until the employer's update timestamp changes. Failed details retain the queue and retry/backoff. This trades gradual initial import for bounded Worker memory and keeps graduate-only filtering intact.

## Business analysis and insights

The **Data & business analysis** role filter includes business/business systems analysts, product and marketing analysts, analytics and insights roles, decision scientists, operations research analysts and quantitative analysts. Financial, risk, credit, fraud, pricing, revenue, supply-chain, commercial, operations, strategy and sales analyst titles additionally require data-work evidence in the available employer description (for example SQL, Python, statistical modeling, forecasting or dashboards). Community listings without descriptions can qualify through explicit analytics titles. Associate business/analytics titles are recognized as entry-level, while senior titles remain outside the early-career default. Matching is rule-based and cannot guarantee eligibility; existing location and graduate-degree exclusions still apply. Parser upgrades re-read monitored feeds to include previously ignored titles.

## Handshake

Jobs offers Berkeley Handshake as an **external search** shortcut in Sources and the footer. It is not counted among monitored/synced feeds and no signed-in Handshake pages are fetched. A Handshake URL entered into Monitor board explains how to copy the employer's external Greenhouse, Lever or Ashby destination instead; that employer can then use the existing direct monitor.

No public student marketplace feed or available Handshake plugin was verified. Handshake's documented EDU API requires institution-managed access and support-enabled credentials; no such grant is configured here. Automated Handshake import is therefore unavailable. Its native saved-search alerts can be configured in Handshake (daily or weekly, up to 25 jobs per email); those emails are not parsed into Vector Jobs by this update.

References: [Handshake EDU API](https://support.joinhandshake.com/hc/en-us/articles/31061076506391-Getting-Started-with-EDU-API), [Handshake job alerts](https://support.joinhandshake.com/hc/en-us/articles/218693388-Saving-Job-Searches-and-Receiving-Job-Alerts), [Berkeley Handshake](https://career.berkeley.edu/handshake/).
