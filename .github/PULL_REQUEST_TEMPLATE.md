## What & why

<!-- What does this change, and what problem does it solve? Link the related issue. -->

## Checklist

- [ ] I've read [CONTRIBUTING.md](https://github.com/straplocked/beacon-uptime/blob/main/CONTRIBUTING.md) and signed the [CLA](https://github.com/straplocked/beacon-uptime/blob/main/CLA.md) (the bot will prompt on your first PR)
- [ ] `npm test` passes
- [ ] No new lint problems (`npm run lint`)
- [ ] The build passes: `npx next build`, plus no new errors from `npx tsc -p tsconfig.worker.json` (see CONTRIBUTING for why not `npm run build`)
- [ ] New/changed behavior has test coverage
- [ ] Docs updated if behavior changed (README, `docs/`)
- [ ] No secrets, API keys, webhook URLs, private hostnames, or personal data in the diff
