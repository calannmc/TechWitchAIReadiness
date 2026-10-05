# The scoring model

Every rule here exists twice: in `js/engine.js` and in `model/cx_ai_fit_assessment_v0.xlsx`. `test/engine.test.js` checks the two agree on the example client. Change a rule in both places or the test will tell you.

All factors and thresholds are illustrative until calibrated on the first five real clients.

## 1. Opportunity, per intent

For each of the top 20 contact reasons:

    opportunity = share of volume × automatability × risk factor

Automatability, by intent type:

| Intent type | Factor |
| --- | --- |
| Informational, content already exists | 1.0 |
| Informational, content needs writing | 0.8 |
| Transactional, API exists | 0.9 |
| Transactional, no API (integration build or RPA) | 0.5 |
| Complex: judgement, complaint, distress | 0.2 |
| Regulated, or policy says human | 0 |

Risk factor, by the consequence of a wrong answer:

| Consequence | Factor |
| --- | --- |
| Low: customer re-asks or gets handed over | 1.0 |
| Medium: wasted journey, refund, repeat contact | 0.8 |
| High: financial, legal, safety, vulnerable customer | 0.5 |

Automatable share of contacts = the sum of opportunity across the 20 intents.

Annual value per intent (illustrative) = total monthly contacts × opportunity × cost per contact × 12.

## 2. Readiness, by dimension

Five dimensions, each scored 1 to 5 against a rubric: Data, Knowledge, Integration, People, Governance. Equal weights in v1.

People is a gate. A 1 on People means "no platform yet, name an owner first", whatever the opportunity says.

## 3. Status of each intent

An intent is in the top quartile when its opportunity ranks in the top five of the 20 (Excel RANK semantics: ties share the higher rank).

Its readiness dependency is the lower of People and the dimension it depends on: Knowledge for informational intents, Integration for transactional, People for everything else.

| Opportunity | Dependency score | Status |
| --- | --- | --- |
| Automatability 0 | any | Regulated, stays human |
| Top quartile, above 0 | 3 or more | Phase 1 |
| Top quartile, above 0 | under 3 | Fix first |
| Not top quartile | 3 or more | Later |
| Not top quartile | under 3 | Leave with humans |

## 4. Recommended path

| Condition | Path |
| --- | --- |
| People is 1 | No platform yet. Name an owner first. |
| Automatable share under 15% | No platform. Fix the help centre and the top three processes. |
| 15% to 35%, transactional share of volume 25% or more | Platform with integration tooling. Phase 1 is two intents that already have APIs. |
| 15% to 35%, otherwise | Knowledge-led bot on a lighter platform, or the ticketing vendor's own AI. |
| 35% or more, voice share of volume 40% or more | Full platform, voice-capable first, chat second. |
| 35% or more, otherwise | Full platform. Voice only if the voice share earns it. |

## 5. Requirements profile: the column weights

Weights are 0 to 3 on each of the 13 capability columns.

| Capability | Weight rule |
| --- | --- |
| Voice | 3 if voice share of volume is 40% or more, 1 if 10% to 40%, else 0 |
| Chat and messaging | 3 if chat, social and in-app are 10% or more of volume, 1 if any, else 0 |
| Languages | 2 if more than two languages, else 0 |
| Knowledge and RAG | 3 if informational share is 40% or more, 2 if 20% or more, else 1 |
| Integration tooling | 3 if transactional share is 25% or more, 2 if 10% or more, else 1 |
| Agentic actions | 2 if transactional share is 25% or more, else 0 |
| Auth handling | 3 if customers must be identified before help, else 0 |
| Agent handoff | always 3 |
| Build model | 3 if nobody builds in-house, 1 if some skills, 0 if yes |
| Analytics and intent discovery | 3 if Data readiness is 2 or under, else 2 |
| Pricing model | always 2 |
| Minimum team to run | 3 if People readiness is 2 or under, else 1 |
| Compliance and residency | 3 if any regulated flag is set or hosting is UK only, else 0 |

## 6. Fit matrix

Each platform is scored 0 to 3 per capability (0 none, 1 basic, 2 solid, 3 best in class) and given a year-one cost band. A platform only ranks once all 13 columns are scored.

    fit = Σ(weight × score) ÷ (3 × Σ weight)
    over-spec index = Σ score, over the columns where weight = 0

Over-spec is what the client would pay for and never use. The budget band filter runs before ranking: a platform whose cost band is above the client's budget band drops out, and the report says what it would have scored.
