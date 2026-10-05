/* Checks the scoring engine against the v0 spreadsheet (model/cx_ai_fit_assessment_v0.xlsx, recalculated 2026-10-05).
   Run: node test/engine.test.js */
const E = require('../js/engine.js');
const c = E.compute(E.EXAMPLE, E.MATRIX_DEFAULT, E.SETTINGS_DEFAULT);
let failed = 0;
function eq(name, got, want) { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) failed++; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${JSON.stringify(got)}${ok ? '' : ' (wanted ' + JSON.stringify(want) + ')'}`); }
const r4 = x => Math.round(x * 1e4) / 1e4;

eq('automatable share', r4(c.automatable), 0.5162);
eq('annual value', Math.round(c.value), 975618);
eq('informational share', r4(c.infoShare), 0.14);
eq('transactional share', r4(c.transShare), 0.51);
eq('voice share', r4(c.voiceShare), 0.5143);
eq('path', c.path, 'Full platform, voice-capable first, chat second.');
eq('phase 1', c.phase1.map(r => r.name), ['Submit a meter reading', 'Make a payment', 'Update contact details', 'Account balance']);
eq('fix first', c.fixFirst.map(r => r.name), ['Tariff information']);
eq('readiness fixes', c.readinessFixes.map(f => f.dim + ':' + f.score), ['Knowledge:2']);
eq('regulated stay human', c.rows.filter(r => r.status === 'Regulated, stays human').map(r => r.name), ['Payment plan or arrears', 'Power cut or supply issue', 'Priority services register']);
eq('weights', E.CAPS.map(x => c.weights[x.key]), [3, 3, 0, 1, 3, 2, 3, 3, 1, 2, 2, 1, 3]);
eq('ranking', c.ranking.map(p => [p.rank, p.name, Math.round(p.fit * 1000) / 10, p.over]), [[1, 'Example platform B (illustrative)', 90.1, 3], [2, 'Example platform A (illustrative)', 75.3, 1], [3, 'Example platform C (illustrative)', 56.8, 1]]);
eq('unscored platforms', c.unscored.length, 7);

// Gate: People at 1 overrides everything.
const gated = JSON.parse(JSON.stringify(E.EXAMPLE)); gated.readiness.People = 1;
const g = E.compute(gated, E.MATRIX_DEFAULT, E.SETTINGS_DEFAULT);
eq('people gate path', g.path, 'No platform yet. Name an owner first.');
eq('people gate empties phase 1', g.phase1.length, 0);

// Empty assessment does not throw and has no path to a platform.
const blank = { q: {}, intents: [], readiness: {} };
const b = E.compute(blank, E.MATRIX_DEFAULT, E.SETTINGS_DEFAULT);
eq('blank automatable', b.automatable, 0);
eq('blank path', b.path, 'No platform. Fix the help centre and the top three processes.');

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
