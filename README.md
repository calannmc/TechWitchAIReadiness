# CX AI Fit Assessment

A fit-before-you-buy assessment for contact centre AI platforms. It tells a client what they need before they buy a platform, with the numbers behind it, and it can say "buy nothing yet".

Two outputs:

- A requirements profile: what they get contacted about, how much is realistically automatable, what each candidate needs, and who will run it.
- A fit recommendation: which platform shape matches that profile, what they would pay for and not use (the over-spec index), and what to fix first.

## Run it

No build, no server. Open `index.html` in a browser, or host the folder on GitHub Pages.

The app opens with an illustrative example client loaded so every tab shows something. Use **New** on the top bar for a real client.

Tabs, in the order a consultant works them:

1. **Questionnaire**: 38 questions in seven sections (contact profile, intents, systems, knowledge, people, constraints, goals and budget).
2. **Intents**: the top 20 contact reasons with share of volume, type and the consequence of a wrong answer.
3. **Readiness**: five dimensions scored 1 to 5 against a written rubric. People is a gate.
4. **Fit matrix**: platforms scored 0 to 3 on 13 capabilities, plus a year-one cost band. Real platform rows are blank for the team to score; the three example rows are placeholders, not real platforms.
5. **Results**: automatable share, recommended path, Phase 1 candidates, fix-first list, fit ranking with over-spec.
6. **Report**: the eight-section client report, as a PDF or as text to paste.
7. **Settings**: every factor and threshold, all illustrative until calibrated.

Everything is stored in the browser you are using. **Export** and **Import** on the top bar move an assessment between machines as a JSON file; **Export matrix** on the Fit matrix tab does the same for the shared matrix and settings.

## How the scoring works

`docs/model.md` has the full rules. The short version:

- Opportunity per intent = share of volume × automatability × risk factor. Summed, that is the automatable share of contacts.
- Phase 1 = the top five intents by opportunity whose readiness dependency is 3 or more: informational intents need Knowledge, transactional need Integration, all need People.
- Fit score = Σ(weight × score) ÷ (3 × Σ weight), where the weights come from the client's profile. Over-spec index = capability points in columns the profile weights 0.
- The budget band filters platforms before ranking.

## Repository

```
index.html            the app
css/app.css           styles, light and dark
js/engine.js          scoring engine and reference data (no DOM; also loads in Node)
js/app.js             the UI
vendor/jspdf.umd.min.js   PDF generation, vendored so the app works offline (MIT, see vendor/LICENSE-jspdf.txt)
model/cx_ai_fit_assessment_v0.xlsx   the v0 spreadsheet model the engine mirrors
docs/model.md         the scoring rules in plain words
test/engine.test.js   checks the engine against the spreadsheet's numbers
```

Run the engine checks with `node test/engine.test.js` (or `npm test`).

## Roadmap

- v0: spreadsheet model (`model/`). Run on two live deals by hand.
- v1: this app. Consultant keys in the data. Five paid assessments, then tune the weights.
- v2: upload a ticket export; cluster intents and pre-fill the intent map; draft the narrative against the fixed framework.
- v3: pull contacts straight from the ticketing and contact centre platforms. Free front-door version.
