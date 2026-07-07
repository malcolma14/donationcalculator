# Giving gap calculator

A compact, embeddable, single-screen calculator for a Canadian financial advisory practice (Adam Malcolm, Strategic Generosity, on the IG Wealth Management platform). It compares the after-tax cost of two ways of making the same charitable gift:

- **Sell the shares, donate the cash** — triggers capital gains tax on the sale.
- **Donate the shares directly** — the capital gain on publicly traded shares donated in kind to a registered charity is taxed at a rate of zero.

Both scenarios produce the same donation receipt (fair market value); the savings equal the capital gains tax avoided.

## Running it

Static site, no build step, no dependencies, nothing fetched at runtime. Serve the repo root over HTTP:

```
npm start        # http-server on :8080
```

or open `index.html` from any static host. The widget degrades gracefully down to a 320px embed column.

## Structure

| Path | What it is |
|---|---|
| `index.html` | The widget page (header, inputs, comparison cards, savings line, email capture, footer). |
| `js/calculator.js` | Calculation engine and hard-coded tax tables. Loads in the browser (`window.GivingGap`) and in Node (for tests). |
| `js/widget.js` | DOM wiring: live updates, thousands formatting, number-roll on the savings figure, form validation. |
| `css/tokens.css` | Strategic Generosity Blueprint design tokens (colours, type, motion). |
| `css/widget.css` | Widget styles. |
| `test/calculator.test.js` | Unit tests, including the worked example from the spec. |
| `assets/` | IG Wealth Management logo and self-hosted Nunito Sans variable fonts. |

## Tax data

All rates are transcribed from the EY combined federal and provincial personal tax rate cards (proposals and news releases to **January 15, 2026**). They are hard-coded constants in `js/calculator.js`; live-fetched rates are prohibited for this tool.

Apparent quirks in the tables are correct per EY, do not "fix" them:

- Manitoba's top rate is lower than the bracket below it (basic personal amount clawback ends at $400,001).
- BC, NB, NL, NS, ON and PE have non-monotonic low/mid brackets (low-income reductions and surtax interactions).
- Nunavut's $181,440 threshold differs by $1 from other provinces.
- Alberta's provincial credit really is 60% on the first $200.
- Quebec rows combine EY's abated federal table with the Quebec table, and Quebec's donation credit uses its own abated federal rates.

**Maintenance:** the tables are updated once per year, by hand, when Adam drops the new EY cards into the Research Library — never from a live source. Practice Ops owns the annual refresh. Update the constants and the `RATES_AS_OF` stamp in `js/calculator.js`; the stamp renders in the widget footer so staleness is visible.

### Simplifying assumptions (disclosed in the widget disclaimer)

- Income is treated as taxable income and the capital gain is not stacked on top of it when determining the marginal rate.
- Shares are held personally in a non-registered account.
- The donation is fully creditable within the 75% net income limit; alternative minimum tax is not modelled.
- The Ontario Health Premium is not modelled.

## Tests

```
npm test
```

Covers the spec's worked example (Ontario, $150,000 income, $25,000 shares, $10,000 cost → savings $3,255.75), bracket boundary readings, the federal 33% step, the BC and QC high-income credit rates, the no-gain edge case, and the preserved EY quirks.

## Not wired yet

- **Guide delivery:** the email form validates and shows the thank-you state, but no backend receives the lead. The serverless endpoint and Mailchimp tag are pending (see `js/widget.js`, form submit handler).
- **"Book a conversation" link** in the thank-you state points at `#` until the booking URL is confirmed.
- Visitor-facing copy is draft v1 pending the two-pass content process, and compliance review of the tool is an open item.
