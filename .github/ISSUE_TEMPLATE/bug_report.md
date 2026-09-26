---
name: Bug report
about: Something isn't working
title: ''
labels: bug
assignees: ''
---

**What happened?**
A clear description of the bug.

**Steps to reproduce**
1.
2.
3.

**Expected behavior**
What you expected to happen instead.

**Setup**
- Install method: [Docker Compose with the published image / Docker Compose building locally / local dev (`npm run dev` + worker + scheduler)]
- Version: [commit SHA, or image tag + the date you pulled]
- Where it shows up: [dashboard / public status page / REST API / MCP / alerts / monitor checks]
- Monitor type, if relevant: [HTTP / TCP / DNS / SSL / Ping / Heartbeat]
- Notification channel, if relevant: [Email / Slack / Discord / Webhook]
- Browser, for UI bugs: [e.g. Firefox 131, Chrome on Android]
- Reverse proxy in front? [none / NPM / Caddy / Traefik / other]

**Screenshots / logs**
If applicable. Logs from all three processes help (`docker compose logs app worker scheduler`). Please redact anything sensitive — API keys (`bk_...`), webhook/Slack/Discord URLs, internal hostnames, and subscriber email addresses.

> ⚠️ **Security issue?** Don't file it here — see [SECURITY.md](https://github.com/straplocked/beacon-uptime/blob/main/SECURITY.md) for private reporting.
