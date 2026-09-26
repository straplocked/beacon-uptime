# Security Policy

Beacon Uptime sits close to other people's infrastructure: it holds API keys and notification webhook URLs, stores subscriber email addresses, and makes requests from the server to addresses that users type in. Security reports are taken seriously and handled with priority.

## Supported versions

| Version | Supported |
|---|---|
| Latest commit on `main` | ✅ |
| Latest tagged release (once releases exist) | ✅ |
| Anything older | ❌ — please update |

Self-hosted instances update by pulling the latest image (or `main`) and redeploying; there are no long-term support branches.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately via **GitHub's private vulnerability reporting**: go to this repository's **Security** tab → **Report a vulnerability**. That keeps the report visible only to you and the maintainer until a fix is released.

Include what you can of the following:

- A description of the issue and its impact
- Steps to reproduce (a proof of concept helps a lot)
- The commit or image tag you tested against
- Any suggested fix, if you have one

## What to expect

- **Acknowledgment** within a few days (this is a solo-maintained project — usually faster).
- An assessment of severity and impact, discussed with you in the advisory thread.
- A fix on `main` (and in a tagged release, once releases exist), with the advisory published after operators have had a reasonable window to update.
- Credit in the advisory and release notes, if you'd like it.

## Scope notes

Areas where reports are especially welcome:

- **Server-side request forgery (SSRF).** Beacon makes requests from the server to URLs and hosts that users supply: monitor targets, notification webhook URLs, and the site whose favicon brands a status page. [`src/lib/net/safe-fetch.ts`](src/lib/net/safe-fetch.ts) is the project's SSRF guard. Ways to make a Beacon server reach, or leak data from, loopback, private, link-local (cloud metadata) or other internal addresses are in scope — including bypasses of that guard via redirects, IPv4-mapped IPv6, alternate IP encodings or DNS rebinding.
- **Cross-organization data access.** Everything in Beacon — monitors, status pages, incidents, notification channels, API keys — belongs to an organization and is scoped by `organization_id`. Any way for a user or an API key to read or change another organization's data is treated as critical. So is escalating past your role (`viewer` → `member` → `admin` → `owner`) inside an organization, or switching into an organization you aren't a member of.
- **API key handling.** `bk_` keys authenticate `/api/v1/*` and the MCP server at `/api/mcp`. Those routes accept bearer keys only and deliberately ignore session cookies (CSRF). A key leaking through logs, responses or pages, a key that keeps working after it has been regenerated or revoked, a cookie-authenticated request being accepted on those routes, or an MCP tool reaching past its key's organization are all in scope.
- **Notification channel secrets.** Webhook, Slack and Discord URLs are credentials — anyone who holds one can post to that channel — and webhook signing secrets must stay private too. Exposing any of them to another organization, to a role that shouldn't see them, on a public page, or in an API response or log is in scope.
- **Public status pages exposing more than intended.** A private status page being reachable, internal-only incident comments reaching the public page or subscribers, monitors that aren't on a page leaking through it, internal hostnames or monitor details the operator didn't choose to show, subscriber email addresses leaking, or unsubscribing someone else. Script or CSS injection through brand colours, footer links or incident text is in scope as well.
- **Authentication and sessions.** Login, registration, session cookies, logout, and the active-organization cookie.

Generally out of scope:

- Anything that requires prior control of the host, the database, Redis, or the operator's environment variables.
- Deployment choices made by an operator, such as publishing the Postgres or Redis ports to the internet, running without TLS, or leaving the seeded demo account in place. If a shipped default makes one of these easy to get wrong, a regular issue about the default is welcome.
- Volumetric denial of service, and automated-scanner output with no demonstrated impact (for example a missing header on a page that has nothing to protect).
- Vulnerabilities in dependencies are best reported upstream, but a heads-up here is welcome if Beacon's usage makes one exploitable.

Testing must only be done against **your own self-hosted instance** — never against instances or hosted services you don't own.

## Fixed issues

Security fixes that need action from an operator will be listed here; the rest go in [CHANGELOG.md](CHANGELOG.md). None so far.
