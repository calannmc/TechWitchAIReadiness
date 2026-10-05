/* CX AI Fit Assessment: UI. Depends on js/engine.js (window.CXFit) and vendor/jspdf.umd.min.js.
   Storage is this browser's localStorage. Assessments, the fit matrix and settings move between machines as JSON files. */
(function () {
  'use strict';
  const E = window.CXFit;
  const { CAPS, INTENT_TYPES, RISKS, BANDS, DIMS, LISTS, QSCHEMA, SETTINGS_DEFAULT, THRESHOLD_LABELS, MATRIX_DEFAULT, EXAMPLE, blankScores, num, compute } = E;
  const BRAND = 'Innovation Hub · v1';
  const KEYS = { assessments: 'cxfit.assessments.v1', matrix: 'cxfit.matrix.v1', settings: 'cxfit.settings.v1', draft: 'cxfit.draft.v1', tab: 'cxfit.tab', theme: 'cxfit.theme' };

  /* ---------------------------------------------------------------- helpers */
  const $ = s => document.querySelector(s);
  function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pct(v, d) { return v == null ? '' : (v * 100).toFixed(d == null ? 0 : d) + '%'; }
  function gbp(v) { return v == null ? '' : '£' + Math.round(v).toLocaleString('en-GB'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function newId() { return 'a-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function slug(s) { return (s || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'untitled'; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
  function lsJson(k, fallback) { try { const v = JSON.parse(lsGet(k) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; } }
  let toastT = null;
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600); }
  function confirmDialog(text) {
    return new Promise(res => {
      const d = $('#confirm'); $('#confirmText').textContent = text;
      const yes = $('#confirmYes'), no = $('#confirmNo');
      const done = v => { yes.onclick = null; no.onclick = null; if (d.open) d.close(); res(v); };
      yes.onclick = () => done(true); no.onclick = () => done(false);
      if (typeof d.showModal === 'function') d.showModal(); else res(window.confirm ? window.confirm(text) : true);
    });
  }
  function statusClass(s) { return s === 'Phase 1' ? 'status-phase1' : s === 'Fix first' ? 'status-fix' : s === 'Later' ? 'status-later' : s === 'Regulated, stays human' ? 'status-reg' : 'status-leave'; }
  function downloadFile(filename, data, mime) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied'); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.top = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('Copied'); } catch (e2) { toast('Select the text and copy it yourself'); } setTimeout(() => ta.remove(), 4000); }
  }

  /* ---------------------------------------------------------------- state */
  let A = null;                               // working assessment
  let M = clone(MATRIX_DEFAULT);
  let S = clone(SETTINGS_DEFAULT);
  let dirty = false, matrixDirty = false, settingsDirty = false;
  let saved = {};                             // id -> assessment
  let tab = 'results';

  function blankAssessment() {
    const q = {}; QSCHEMA.forEach(s => s.items.forEach(i => { q[i.key] = (i.kind === 'num' || i.kind === 'pct') ? null : ''; }));
    const intents = []; for (let i = 0; i < 20; i++) intents.push({ name: '', share: null, type: '', risk: '', note: '' });
    return { id: newId(), name: '', date: today(), q, intents, readiness: { Data: null, Knowledge: null, Integration: null, People: null, Governance: null } };
  }
  function normalise(a) {
    const b = blankAssessment();
    b.id = a.id || b.id; b.name = a.name || ''; b.date = a.date || b.date; if (a.example) b.example = true; if (a.updatedAt) b.updatedAt = a.updatedAt;
    Object.keys(b.q).forEach(k => { if (a.q && a.q[k] != null) b.q[k] = a.q[k]; });
    for (let i = 0; i < 20; i++) { const src = (a.intents || [])[i] || {}; b.intents[i] = { name: src.name || '', share: num(src.share), type: src.type || '', risk: src.risk || '', note: src.note || '' }; }
    DIMS.forEach(d => { b.readiness[d.key] = a.readiness ? num(a.readiness[d.key]) : null; });
    return b;
  }
  function normaliseMatrix(m) {
    const platforms = (m && Array.isArray(m.platforms) ? m.platforms : []).map(p => ({ id: p.id || ('p-' + Math.random().toString(36).slice(2, 8)), name: p.name || '', band: p.band || '', scores: Object.assign(blankScores(), p.scores || {}) }));
    return { platforms };
  }
  function normaliseSettings(s) {
    const out = Object.assign(clone(SETTINGS_DEFAULT), s || {});
    out.auto = Object.assign({}, SETTINGS_DEFAULT.auto, (s && s.auto) || {}); out.risk = Object.assign({}, SETTINGS_DEFAULT.risk, (s && s.risk) || {});
    return out;
  }
  function loadAssessment(obj, opts) { A = normalise(clone(obj)); dirty = !!(opts && opts.dirty); lsSet(KEYS.draft, JSON.stringify(A)); render(); updateStatus(); }
  function markDirty() { dirty = true; lsSet(KEYS.draft, JSON.stringify(A)); updateStatus(); }
  function persistSaved() { return lsSet(KEYS.assessments, JSON.stringify(saved)); }

  /* ---------------------------------------------------------------- tabs and render */
  const TABS = [['results', 'Results'], ['questionnaire', 'Questionnaire'], ['intents', 'Intents'], ['readiness', 'Readiness'], ['matrix', 'Fit matrix'], ['report', 'Report'], ['settings', 'Settings']];
  function renderTabs() {
    const t = $('#tabs'); t.innerHTML = '';
    TABS.forEach(([k, label]) => { const b = h(`<button class="tab" role="tab" aria-selected="${tab === k}" data-tab="${k}">${label}</button>`); b.onclick = () => { tab = k; lsSet(KEYS.tab, k); render(); window.scrollTo(0, 0); }; t.appendChild(b); });
  }
  function render() {
    renderTabs();
    const m = $('#main'); m.innerHTML = '';
    if (!A) return;
    ({ results: renderResults, questionnaire: renderQuestionnaire, intents: renderIntents, readiness: renderReadiness, matrix: renderMatrix, report: renderReport, settings: renderSettings })[tab](m);
    renderPicker();
  }

  /* ---------------------------------------------------------------- Results */
  function renderResults(m) {
    const c = compute(A, M, S);
    m.appendChild(h(`<div class="panel">
      <div class="toolbar"><div><h2>${esc(A.name || 'Untitled assessment')}</h2><p class="note">${esc(A.date || '')}${A.example ? ' · illustrative example, not a real client' : ''}</p></div><div class="spacer"></div>
        <span class="chip ${c.gate ? 'bad' : 'good'}">${c.gate ? 'People gate: no platform yet' : 'People gate open'}</span></div>
      <div class="grid tiles">
        <div class="tile"><span class="label">Automatable share</span><span class="value">${pct(c.automatable, 1)}</span><span class="sub">of ${c.vol.toLocaleString('en-GB')} contacts a month</span></div>
        <div class="tile"><span class="label">Annual value</span><span class="value">${gbp(c.value) || '£0'}</span><span class="sub">illustrative, at £${(num(A.q.cost) || 0).toFixed(2)} per contact</span></div>
        <div class="tile"><span class="label">Readiness</span><span class="value">${c.avgReady == null ? '–' : c.avgReady.toFixed(1)}</span><span class="sub">average of five, People ${c.people == null ? '–' : c.people}</span></div>
        <div class="tile"><span class="label">Mix</span><span class="value">${pct(c.voiceShare)}</span><span class="sub">voice · ${pct(c.infoShare)} informational · ${pct(c.transShare)} transactional</span></div>
      </div>
      <div class="path" style="margin-top:14px"><strong>Recommended path</strong>${esc(c.path)}</div>
    </div>`));
    const li = rows => rows.length ? rows.map(r => `<li>${esc(r.name)} <span class="note">${pct(r.share)}</span></li>`).join('') : '<li class="note">None yet</li>';
    m.appendChild(h(`<div class="panel"><h3>Opportunity by readiness</h3><p class="lead">Each of the top 20 intents lands in one quadrant. Only the top right goes into the Phase 1 plan.</p>
      <div class="quad">
        <div class="q"><span class="axis">High opportunity · not ready</span><h4>Fix first</h4><ul>${li(c.fixFirst)}</ul></div>
        <div class="q hot"><span class="axis">High opportunity · ready</span><h4>Phase 1</h4><ul>${li(c.phase1)}</ul></div>
        <div class="q"><span class="axis">Low opportunity · not ready</span><h4>Leave with humans</h4><ul>${li(c.rows.filter(r => r.status === 'Leave with humans'))}</ul></div>
        <div class="q"><span class="axis">Low opportunity · ready</span><h4>Later</h4><ul>${li(c.rows.filter(r => r.status === 'Later'))}</ul></div>
      </div>
      <p class="helpline">Regulated intents (stay human): ${c.rows.filter(r => r.status === 'Regulated, stays human').map(r => esc(r.name)).join(', ') || 'none'}</p></div>`));
    m.appendChild(h(`<div class="two">
      <div class="panel"><h3>Phase 1 candidates</h3><div class="tablewrap"><table><thead><tr><th>Intent</th><th class="num">Share</th><th class="num">Value / yr</th><th>Depends on</th></tr></thead><tbody>
        ${c.phase1.length ? c.phase1.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${pct(r.share)}</td><td class="num">${gbp(r.value)}</td><td>${esc(r.dep)}</td></tr>`).join('') : '<tr><td colspan="4" class="note">Nothing qualifies yet. Check the readiness scores and the top intents.</td></tr>'}
      </tbody></table></div></div>
      <div class="panel"><h3>Fix first</h3><div class="tablewrap"><table><thead><tr><th>What</th><th>Blocker</th><th class="num">Score</th></tr></thead><tbody>
        ${c.fixFirst.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.dep)}</td><td class="num">${r.depScore}</td></tr>`).join('')}
        ${c.readinessFixes.map(f => `<tr class="sub"><td>Readiness: ${esc(f.dim)}</td><td>Get to 3: ${esc(f.three)}</td><td class="num">${f.score}</td></tr>`).join('')}
        ${(!c.fixFirst.length && !c.readinessFixes.length) ? '<tr><td colspan="3" class="note">Nothing to fix first.</td></tr>' : ''}
      </tbody></table></div></div>
    </div>`));
    m.appendChild(h(`<div class="panel"><h3>Fit ranking</h3><p class="lead">Fully scored platforms within budget, ranked by fit. Over-spec counts the capability points this client would pay for and never use.</p>
      <div class="tablewrap"><table><thead><tr><th class="num">#</th><th>Platform</th><th class="num">Fit</th><th class="num">Over-spec</th><th>Cost band</th></tr></thead><tbody>
        ${c.ranking.length ? c.ranking.map(p => `<tr><td class="num">${p.rank}</td><td>${esc(p.name)}</td><td class="num">${pct(p.fit)}</td><td class="num">${p.over}</td><td>${esc(p.band)}</td></tr>`).join('') : '<tr><td colspan="5" class="note">No platform is fully scored and within budget yet.</td></tr>'}
      </tbody></table></div>
      <p class="helpline">${c.unscored.length} platform${c.unscored.length === 1 ? '' : 's'} not fully scored${c.overBudget.length ? `. Over budget: ${c.overBudget.map(p => `${esc(p.name)} (would score ${pct(p.fit)})`).join(', ')}` : ''}.</p></div>`));
    m.appendChild(h(`<div class="panel"><h3>Requirements profile</h3><p class="lead">The weights the fit matrix uses for this client, derived from the answers.</p>
      <div class="tablewrap"><table><thead><tr><th>Capability</th><th class="num">Weight</th></tr></thead><tbody>
        ${CAPS.map(cp => `<tr><td>${esc(cp.name)}</td><td class="num">${c.weights[cp.key]}</td></tr>`).join('')}
      </tbody></table></div></div>`));
  }

  /* ---------------------------------------------------------------- Questionnaire */
  function renderQuestionnaire(m) {
    const p = h(`<div class="panel"><h2>Questionnaire</h2><p class="lead">38 questions in seven sections. Every answer feeds the profile, the opportunity score or the readiness score. Percentages are entered as whole numbers.</p>
      <div class="qrow"><div class="code">Client</div><div><input type="text" id="f_name" placeholder="Client name"></div><div class="field"><input type="text" id="f_date" placeholder="YYYY-MM-DD"></div></div></div>`);
    p.querySelector('#f_name').value = A.name; p.querySelector('#f_date').value = A.date;
    p.querySelector('#f_name').oninput = e => { A.name = e.target.value; markDirty(); };
    p.querySelector('#f_date').oninput = e => { A.date = e.target.value; markDirty(); };
    QSCHEMA.forEach(sec => {
      const s = h(`<div class="qsection"><h3>${esc(sec.section)}</h3>${sec.note ? `<p class="note" style="margin-bottom:6px">${esc(sec.note)}</p>` : ''}</div>`);
      sec.items.forEach(it => {
        const row = h(`<div class="qrow"><div class="code">${esc(it.code)}</div><div><div>${esc(it.label)}</div><div class="feeds">${esc(it.feeds)}</div></div><div class="field"></div></div>`);
        const f = row.querySelector('.field'); let input; const v = A.q[it.key];
        if (it.kind === 'num') { input = h(`<input type="number" id="q_${it.key}" step="${it.step || '1'}" min="0">`); input.value = v == null ? '' : v; input.oninput = e => { A.q[it.key] = num(e.target.value); markDirty(); }; f.appendChild(input); }
        else if (it.kind === 'pct') { const wrap = h(`<div class="pctwrap"><input type="number" id="q_${it.key}" step="1" min="0" max="100"><span>%</span></div>`); input = wrap.querySelector('input'); input.value = v == null ? '' : Math.round(v * 1000) / 10; input.oninput = e => { const n = num(e.target.value); A.q[it.key] = n == null ? null : n / 100; markDirty(); }; f.appendChild(wrap); }
        else if (it.kind === 'pick') { input = h(`<select id="q_${it.key}"><option value="">–</option>${LISTS[it.list].map(o => `<option>${esc(o)}</option>`).join('')}</select>`); input.value = v || ''; input.onchange = e => { A.q[it.key] = e.target.value; markDirty(); }; f.appendChild(input); }
        else if (it.kind === 'long') { input = h(`<textarea id="q_${it.key}"></textarea>`); input.value = v || ''; input.oninput = e => { A.q[it.key] = e.target.value; markDirty(); }; f.appendChild(input); }
        else { input = h(`<input type="text" id="q_${it.key}">`); input.value = v || ''; input.oninput = e => { A.q[it.key] = e.target.value; markDirty(); }; f.appendChild(input); }
        s.appendChild(row);
      });
      p.appendChild(s);
    });
    m.appendChild(p);
  }

  /* ---------------------------------------------------------------- Intents */
  function renderIntents(m) {
    const p = h(`<div class="panel"><div class="toolbar"><div><h2>Intents (B1 to B4)</h2><p class="lead" style="margin:0">Top 20 contact reasons with share of all contacts, type and the consequence of a wrong answer. Shares need not reach 100%.</p></div></div>
      <div class="tablewrap"><table id="intentsTable"><thead><tr><th class="num">#</th><th>Intent</th><th class="num">Share %</th><th>Type</th><th>Wrong answer</th><th>System / API note</th><th class="num">Auto</th><th class="num">Risk</th><th class="num">Opportunity</th><th class="num">Value / yr</th><th>Depends on</th><th>Status</th></tr></thead><tbody></tbody>
      <tfoot><tr><td></td><td><strong>Totals</strong></td><td class="num" id="t_share"></td><td colspan="5"></td><td class="num" id="t_opp"></td><td class="num" id="t_value"></td><td colspan="2"></td></tr></tfoot></table></div>
      <p class="helpline">Automatability and risk factors come from Settings. Phase 1 needs the readiness it depends on at 3 or more: informational intents need Knowledge, transactional need Integration, all need People.</p></div>`);
    const tb = p.querySelector('tbody');
    A.intents.forEach((it, i) => {
      const tr = h(`<tr data-i="${i}"><td class="num">${i + 1}</td><td><input type="text" id="i_name_${i}" style="min-width:160px"></td><td class="num"><input type="number" id="i_share_${i}" step="0.5" min="0" max="100"></td>
        <td><select id="i_type_${i}"><option value="">–</option>${INTENT_TYPES.map(o => `<option>${esc(o)}</option>`).join('')}</select></td>
        <td><select id="i_risk_${i}" style="min-width:90px"><option value="">–</option>${RISKS.map(o => `<option>${esc(o)}</option>`).join('')}</select></td>
        <td><input type="text" id="i_note_${i}" style="min-width:140px"></td><td class="num c-a"></td><td class="num c-r"></td><td class="num c-opp"></td><td class="num c-val"></td><td class="c-dep"></td><td class="c-status"></td></tr>`);
      tr.querySelector(`#i_name_${i}`).value = it.name; tr.querySelector(`#i_share_${i}`).value = it.share == null ? '' : Math.round(it.share * 1000) / 10;
      tr.querySelector(`#i_type_${i}`).value = it.type; tr.querySelector(`#i_risk_${i}`).value = it.risk; tr.querySelector(`#i_note_${i}`).value = it.note;
      tr.querySelector(`#i_name_${i}`).oninput = e => { it.name = e.target.value; markDirty(); };
      tr.querySelector(`#i_share_${i}`).oninput = e => { const n = num(e.target.value); it.share = n == null ? null : n / 100; markDirty(); refreshIntents(p); };
      tr.querySelector(`#i_type_${i}`).onchange = e => { it.type = e.target.value; markDirty(); refreshIntents(p); };
      tr.querySelector(`#i_risk_${i}`).onchange = e => { it.risk = e.target.value; markDirty(); refreshIntents(p); };
      tr.querySelector(`#i_note_${i}`).oninput = e => { it.note = e.target.value; markDirty(); };
      tb.appendChild(tr);
    });
    m.appendChild(p); refreshIntents(p);
  }
  function refreshIntents(p) {
    const c = compute(A, M, S);
    c.rows.forEach(r => {
      const tr = p.querySelector(`tr[data-i="${r.idx}"]`); if (!tr) return;
      tr.querySelector('.c-a').textContent = r.A == null ? '' : r.A.toFixed(1); tr.querySelector('.c-r').textContent = r.Rf == null ? '' : r.Rf.toFixed(1);
      tr.querySelector('.c-opp').textContent = r.opp == null ? '' : pct(r.opp, 1); tr.querySelector('.c-val').textContent = gbp(r.value); tr.querySelector('.c-dep').textContent = r.dep || '';
      const st = tr.querySelector('.c-status'); st.textContent = r.status; st.className = 'c-status ' + statusClass(r.status);
    });
    p.querySelector('#t_share').textContent = pct(c.rows.reduce((t, r) => t + (r.share || 0), 0));
    p.querySelector('#t_opp').textContent = pct(c.automatable, 1); p.querySelector('#t_value').textContent = gbp(c.value);
  }

  /* ---------------------------------------------------------------- Readiness */
  function renderReadiness(m) {
    const p = h(`<div class="panel"><h2>Readiness</h2><p class="lead">Score each dimension 1 to 5 against the descriptions. People is a gate: a 1 means no platform yet, whatever the opportunity says.</p>
      <div class="tablewrap"><table class="rubric"><thead><tr><th>Dimension</th><th>Score</th><th>What a 1 looks like</th><th>What a 3 looks like</th><th>What a 5 looks like</th></tr></thead><tbody></tbody></table></div>
      <p class="helpline" id="gateline"></p></div>`);
    const tb = p.querySelector('tbody');
    DIMS.forEach(d => {
      const tr = h(`<tr><td><strong>${esc(d.key)}</strong></td><td><select id="r_${d.key}" style="min-width:70px"><option value="">–</option>${[1, 2, 3, 4, 5].map(n => `<option>${n}</option>`).join('')}</select></td><td>${esc(d.one)}</td><td>${esc(d.three)}</td><td>${esc(d.five)}</td></tr>`);
      const sel = tr.querySelector('select'); sel.value = A.readiness[d.key] == null ? '' : A.readiness[d.key];
      sel.onchange = e => { A.readiness[d.key] = num(e.target.value); markDirty(); gate(); }; tb.appendChild(tr);
    });
    function gate() { const c = compute(A, M, S); p.querySelector('#gateline').textContent = c.gate ? 'GATE: People is 1. No platform yet, sort the owner first.' : `Average readiness ${c.avgReady == null ? '–' : c.avgReady.toFixed(1)}. ${c.readinessFixes.length ? 'Under 3: ' + c.readinessFixes.map(f => f.dim).join(', ') + '.' : 'Nothing under 3.'}`; }
    m.appendChild(p); gate();
  }

  /* ---------------------------------------------------------------- Matrix */
  function renderMatrix(m) {
    const p = h(`<div class="panel"><div class="toolbar"><div><h2>Fit matrix</h2><p class="lead" style="margin:0">Score each platform 0 to 3 per capability (0 none, 1 basic, 2 solid, 3 best in class) and set a year-one cost band. The matrix is the team's shared view, so keep one owner for it and pass it around as a file.</p></div><div class="spacer"></div>
        <button id="btnAddPlatform">Add platform</button><button id="btnExportMatrix">Export matrix</button><button id="btnImportMatrix">Import matrix</button><input type="file" id="fileMatrix" class="hidden-file" accept="application/json,.json"><button id="btnSaveMatrix" class="primary">Save matrix</button></div>
      <div class="tablewrap"><table id="matrixTable"><thead><tr><th>Platform</th><th>Cost band</th>${CAPS.map(c => `<th title="${esc(c.three)}">${esc(c.name)}<br><span class="note">w <span class="w-${c.key}"></span></span></th>`).join('')}<th class="num">Fit</th><th class="num">Over-spec</th><th>Budget</th><th></th></tr></thead><tbody></tbody></table></div>
      <p class="helpline">The weight row shows this client's profile. Fit and over-spec only appear once all 13 columns are scored. Example rows are illustrative placeholders, not real platforms: delete them once real rows are scored.</p>
      <h3 style="margin-top:16px">What a 3 looks like</h3><div class="tablewrap"><table><tbody>${CAPS.map(c => `<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.three)}</td></tr>`).join('')}</tbody></table></div></div>`);
    const tb = p.querySelector('tbody');
    function rowFor(pl) {
      const tr = h(`<tr data-id="${esc(pl.id)}"><td><input type="text" style="min-width:200px" value="${esc(pl.name)}"></td><td><select class="band"><option value="">–</option>${BANDS.map(b => `<option${pl.band === b ? ' selected' : ''}>${esc(b)}</option>`).join('')}</select></td>
        ${CAPS.map(c => `<td><select class="sc" data-k="${c.key}" style="min-width:52px"><option value="">–</option>${[0, 1, 2, 3].map(n => `<option${num(pl.scores[c.key]) === n ? ' selected' : ''}>${n}</option>`).join('')}</select></td>`).join('')}
        <td class="num c-fit"></td><td class="num c-over"></td><td class="c-budget"></td><td><button class="quiet del" title="Remove row">✕</button></td></tr>`);
      tr.querySelector('input').oninput = e => { pl.name = e.target.value; matrixDirty = true; updateStatus(); };
      tr.querySelector('.band').onchange = e => { pl.band = e.target.value; matrixDirty = true; updateStatus(); refresh(); };
      tr.querySelectorAll('.sc').forEach(sel => { sel.onchange = e => { pl.scores[sel.dataset.k] = num(e.target.value); matrixDirty = true; updateStatus(); refresh(); }; });
      tr.querySelector('.del').onclick = async () => { if (await confirmDialog(`Remove "${pl.name || 'this row'}" from the matrix?`)) { M.platforms = M.platforms.filter(x => x !== pl); matrixDirty = true; tr.remove(); updateStatus(); refresh(); } };
      return tr;
    }
    M.platforms.forEach(pl => tb.appendChild(rowFor(pl)));
    p.querySelector('#btnAddPlatform').onclick = () => { const pl = { id: 'p-' + Date.now().toString(36), name: '', band: '', scores: blankScores() }; M.platforms.push(pl); const tr = rowFor(pl); tb.appendChild(tr); tr.querySelector('input').focus(); matrixDirty = true; updateStatus(); };
    p.querySelector('#btnSaveMatrix').onclick = saveMatrix;
    p.querySelector('#btnExportMatrix').onclick = () => downloadFile(`fit-matrix-${today()}.json`, JSON.stringify({ kind: 'cx-ai-fit-matrix', version: 1, matrix: M, settings: S }, null, 2), 'application/json');
    p.querySelector('#btnImportMatrix').onclick = () => p.querySelector('#fileMatrix').click();
    p.querySelector('#fileMatrix').onchange = e => { const f = e.target.files && e.target.files[0]; if (f) importMatrixFile(f); e.target.value = ''; };
    function refresh() {
      const c = compute(A, M, S); CAPS.forEach(cp => { p.querySelector('.w-' + cp.key).textContent = c.weights[cp.key]; });
      c.platforms.forEach(r => {
        const tr = p.querySelector(`tr[data-id="${CSS.escape(r.id)}"]`); if (!tr) return; tr.querySelector('.c-fit').textContent = r.fit == null ? '' : pct(r.fit); tr.querySelector('.c-over').textContent = r.over == null ? '' : r.over;
        const b = tr.querySelector('.c-budget'); b.textContent = r.budget; b.className = 'c-budget ' + (r.budget === 'Yes' ? 'status-phase1' : r.budget === 'Over budget' ? 'status-reg' : '');
      });
    }
    m.appendChild(p); refresh();
  }
  function importMatrixFile(file) {
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const obj = JSON.parse(rd.result); const mx = obj.matrix || obj; if (!mx.platforms) throw new Error('not a matrix');
        if (!(await confirmDialog('Replace the current fit matrix with the one in this file?'))) return;
        M = normaliseMatrix(mx); matrixDirty = true; if (obj.settings) { S = normaliseSettings(obj.settings); settingsDirty = true; }
        render(); updateStatus(); toast('Matrix loaded. Save matrix to keep it.');
      } catch (e) { toast('That file is not a fit matrix export.'); }
    };
    rd.readAsText(file);
  }

  /* ---------------------------------------------------------------- Report */
  function reportModel() {
    const c = compute(A, M, S); const q = A.q;
    const constraints = [['PCI', 'pci'], ['GDPR special category', 'gdpr'], ['FCA', 'fca'], ['Public sector', 'pub'], ['Health', 'health']].filter(x => q[x[1]] === 'Yes').map(x => x[0]);
    return { c, q, constraints, whatNot: CAPS.filter(cp => c.weights[cp.key] === 0).map(cp => cp.name), needs: CAPS.filter(cp => c.weights[cp.key] === 3).map(cp => cp.name) };
  }
  function renderReport(m) {
    const r = reportModel(); const c = r.c; const q = r.q;
    const p = h(`<div class="panel report"><div class="toolbar"><div><h2>Report: ${esc(A.name || 'Untitled')}</h2><p class="note">${esc(A.date || '')}. Every number is illustrative until the client's actuals replace the model's.</p></div><div class="spacer"></div>
      <button id="btnCopy">Copy as text</button><button id="btnPdf" class="primary">Download PDF</button></div>
      <section><h3>1. The answer on one page</h3>
        <dl class="kv"><dt>Automatable share</dt><dd><strong>${pct(c.automatable, 1)}</strong> of ${c.vol.toLocaleString('en-GB')} contacts a month</dd>
        <dt>Recommended path</dt><dd><strong>${esc(c.path)}</strong></dd>
        <dt>Top candidates</dt><dd>${c.phase1.length ? c.phase1.slice(0, 5).map(x => esc(x.name)).join('; ') : 'none qualify yet'}</dd>
        <dt>Fix first</dt><dd>${[...c.readinessFixes.map(f => `${f.dim} (${f.score})`), ...c.fixFirst.map(x => x.name)].map(esc).join('; ') || 'nothing'}</dd>
        <dt>You need</dt><dd>${r.needs.map(esc).join(', ') || '–'}</dd>
        <dt>You probably don't need</dt><dd>${r.whatNot.map(esc).join(', ') || 'nothing stands out'}</dd></dl></section>
      <section><h3>2. Intent map</h3><div class="tablewrap"><table><thead><tr><th>Intent</th><th class="num">Share</th><th>Type</th><th class="num">Opportunity</th><th class="num">Value / yr</th><th>Status</th></tr></thead><tbody>
        ${c.rows.filter(x => x.name).slice().sort((x, y) => (y.opp || 0) - (x.opp || 0)).map(x => `<tr><td>${esc(x.name)}</td><td class="num">${pct(x.share)}</td><td>${esc(x.type)}</td><td class="num">${x.opp == null ? '' : pct(x.opp, 1)}</td><td class="num">${gbp(x.value)}</td><td class="${statusClass(x.status)}">${esc(x.status)}</td></tr>`).join('')}
      </tbody></table></div></section>
      <section><h3>3. Readiness scorecard</h3><div class="tablewrap"><table><thead><tr><th>Dimension</th><th class="num">Score</th><th>The fix, if under 3</th></tr></thead><tbody>
        ${DIMS.map(d => { const s = num(A.readiness[d.key]); return `<tr><td>${esc(d.key)}</td><td class="num">${s == null ? '–' : s}</td><td>${s != null && s < 3 ? esc('Get to 3: ' + d.three) : ''}</td></tr>`; }).join('')}
      </tbody></table></div>${c.gate ? '<p><strong>People gate: no platform yet. Name an owner first.</strong></p>' : ''}</section>
      <section><h3>4. Fit ranking</h3><div class="tablewrap"><table><thead><tr><th class="num">#</th><th>Platform</th><th class="num">Fit</th><th class="num">Over-spec</th><th>Cost band</th></tr></thead><tbody>
        ${c.ranking.length ? c.ranking.map(x => `<tr><td class="num">${x.rank}</td><td>${esc(x.name)}</td><td class="num">${pct(x.fit)}</td><td class="num">${x.over}</td><td>${esc(x.band)}</td></tr>`).join('') : '<tr><td colspan="5" class="note">No platform fully scored and within budget.</td></tr>'}
      </tbody></table></div>${c.overBudget.length ? `<p class="note">Over budget: ${c.overBudget.map(x => `${esc(x.name)} (would score ${pct(x.fit)})`).join(', ')}.</p>` : ''}${c.unscored.length ? `<p class="note">${c.unscored.length} platform rows are not fully scored and are left out.</p>` : ''}</section>
      <section><h3>5. Phase 1 plan</h3><p>${c.phase1.length ? `Two or three of: ${c.phase1.slice(0, 3).map(x => esc(x.name)).join(', ')}. Eight to twelve weeks. Measure containment, CSAT on bot journeys and repeat contact. Stop rule: containment under half the target at week eight.` : 'No Phase 1 yet. Clear the fix-first list, then re-run.'}</p></section>
      <section><h3>6. Business case (illustrative)</h3><p>Automatable contacts are worth about <strong>${gbp(c.value)}</strong> a year at £${(num(q.cost) || 0).toFixed(2)} a contact. Goal: ${esc(q.goal || '–')}. Target: ${esc(q.target || 'none set')}. Budget band: ${esc(q.budget || 'not set')}. Live by: ${esc(q.liveby || '–')}.</p></section>
      <section><h3>7. Risks and constraints</h3><ul><li>Constraints in scope: ${r.constraints.map(esc).join(', ') || 'none flagged'}${q.residency ? `; hosting ${esc(q.residency)}` : ''}${q.access ? `; ${esc(q.access)}` : ''}.</li>
        <li>Previous automation: ${esc(q.prior || 'none recorded')}.</li><li>Failure in 12 months would look like: ${esc(q.failure || 'not stated')}.</li><li>Contracts: ${esc(q.contracts || 'not recorded')}.</li><li>AI policy: ${esc(q.aipolicy || 'not stated')}.</li></ul></section>
      <section><h3>8. What we need from you to start</h3><ul><li>A named owner for the bot after go-live (currently: ${esc(q.owner || 'not named')}).</li><li>Three months of contact data with reason codes.</li><li>API access to: ${esc(q.backoffice || 'the systems behind the Phase 1 intents')}.</li><li>Sign-off: ${esc(q.signoff || 'to be named')}.</li></ul></section>
      <p class="disc">Opportunity = share × automatability × risk factor. Fit = Σ(weight × score) ÷ (3 × Σ weight). Over-spec = scores in columns the profile weights 0. Thresholds are illustrative until calibrated on the first five clients.</p></div>`);
    p.querySelector('#btnCopy').onclick = () => copyText(reportText());
    p.querySelector('#btnPdf').onclick = downloadPdf;
    m.appendChild(p);
  }
  function reportText() {
    const r = reportModel(); const c = r.c; const q = r.q; const L = [];
    L.push(`CX AI FIT ASSESSMENT: ${A.name || 'Untitled'} (${A.date || ''})`, '');
    L.push('1. THE ANSWER ON ONE PAGE');
    L.push(`Automatable share: ${pct(c.automatable, 1)} of ${c.vol.toLocaleString('en-GB')} contacts a month`);
    L.push(`Recommended path: ${c.path}`);
    L.push(`Top candidates: ${c.phase1.slice(0, 5).map(x => x.name).join('; ') || 'none qualify yet'}`);
    L.push(`Fix first: ${[...c.readinessFixes.map(f => `${f.dim} (${f.score})`), ...c.fixFirst.map(x => x.name)].join('; ') || 'nothing'}`);
    L.push(`You need: ${r.needs.join(', ') || '-'}`); L.push(`You probably don't need: ${r.whatNot.join(', ') || 'nothing stands out'}`, '');
    L.push('2. INTENT MAP'); c.rows.filter(x => x.name).slice().sort((x, y) => (y.opp || 0) - (x.opp || 0)).forEach(x => L.push(`- ${x.name}: ${pct(x.share)} share, ${x.type || '-'}, opportunity ${x.opp == null ? '-' : pct(x.opp, 1)}, ${gbp(x.value) || '-'}/yr, ${x.status}`)); L.push('');
    L.push('3. READINESS'); DIMS.forEach(d => { const s = num(A.readiness[d.key]); L.push(`- ${d.key}: ${s == null ? '-' : s}${s != null && s < 3 ? ' (get to 3: ' + d.three + ')' : ''}`); }); if (c.gate) L.push('People gate: no platform yet. Name an owner first.'); L.push('');
    L.push('4. FIT RANKING'); if (c.ranking.length) c.ranking.forEach(x => L.push(`${x.rank}. ${x.name}: fit ${pct(x.fit)}, over-spec ${x.over}, ${x.band}`)); else L.push('No platform fully scored and within budget.');
    if (c.overBudget.length) L.push('Over budget: ' + c.overBudget.map(x => `${x.name} (would score ${pct(x.fit)})`).join(', ')); L.push('');
    L.push('5. PHASE 1 PLAN'); L.push(c.phase1.length ? `Two or three of: ${c.phase1.slice(0, 3).map(x => x.name).join(', ')}. Eight to twelve weeks. Measure containment, CSAT on bot journeys and repeat contact. Stop rule: containment under half the target at week eight.` : 'No Phase 1 yet. Clear the fix-first list, then re-run.'); L.push('');
    L.push('6. BUSINESS CASE (ILLUSTRATIVE)'); L.push(`Automatable contacts worth about ${gbp(c.value)} a year at £${(num(q.cost) || 0).toFixed(2)} a contact. Goal: ${q.goal || '-'}. Target: ${q.target || 'none set'}. Budget band: ${q.budget || 'not set'}. Live by: ${q.liveby || '-'}.`, '');
    L.push('7. RISKS AND CONSTRAINTS'); L.push(`Constraints: ${r.constraints.join(', ') || 'none flagged'}${q.residency ? '; hosting ' + q.residency : ''}${q.access ? '; ' + q.access : ''}`); L.push(`Previous automation: ${q.prior || 'none recorded'}`); L.push(`Failure would look like: ${q.failure || 'not stated'}`); L.push(`Contracts: ${q.contracts || 'not recorded'}`); L.push(`AI policy: ${q.aipolicy || 'not stated'}`, '');
    L.push('8. WHAT WE NEED TO START'); L.push(`- Named owner after go-live (currently: ${q.owner || 'not named'})`); L.push('- Three months of contact data with reason codes'); L.push(`- API access: ${q.backoffice || 'systems behind the Phase 1 intents'}`); L.push(`- Sign-off: ${q.signoff || 'to be named'}`, '');
    L.push("Every number is illustrative until the client's actuals replace the model's. Opportunity = share x automatability x risk factor. Fit = sum(weight x score) / (3 x sum weight). Over-spec = scores in columns weighted 0.");
    return L.join('\n');
  }
  function downloadPdf() {
    if (!window.jspdf || !window.jspdf.jsPDF) { toast('The PDF library did not load. Use Copy as text instead.'); return; }
    const r = reportModel(); const c = r.c; const q = r.q;
    const { jsPDF } = window.jspdf; const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const W = 210, ML = 16, MR = 16, CW = W - ML - MR; let y = 18;
    const navy = [15, 31, 56], amber = [240, 120, 24], grey = [95, 104, 120], ink = [27, 33, 48];
    function pageBreak(need) { if (y + need > 282) { doc.addPage(); y = 18; } }
    function text(s, size, opts) { opts = opts || {}; doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, opts.color || ink); const lines = doc.splitTextToSize(String(s), opts.width || CW); const lh = size * 0.42; pageBreak(lines.length * lh + 2); doc.text(lines, opts.x || ML, y); y += lines.length * lh + (opts.gap == null ? 2 : opts.gap); }
    function heading(s) { y += 3; pageBreak(12); doc.setDrawColor.apply(doc, amber); doc.setLineWidth(0.8); doc.line(ML, y - 1, ML + 10, y - 1); y += 3; text(s, 13, { bold: true, color: navy, gap: 3 }); }
    function table(cols, rows) {
      const widths = cols.map(cl => cl.w); const size = 9; const lh = size * 0.42;
      function row(cells, bold, fill) {
        const wrapped = cells.map((cell, i) => doc.splitTextToSize(String(cell == null ? '' : cell), widths[i] - 3)); const n = Math.max.apply(null, wrapped.map(w => w.length)); const rh = n * lh + 3; pageBreak(rh);
        if (fill) { doc.setFillColor(238, 240, 244); doc.rect(ML, y - lh + 1, CW, rh, 'F'); }
        doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor.apply(doc, bold ? grey : ink); let x = ML + 1.5;
        wrapped.forEach((w, i) => { const align = cols[i].num ? 'right' : 'left'; const tx = align === 'right' ? x + widths[i] - 3 : x; doc.text(w, tx, y, { align }); x += widths[i]; });
        y += rh; doc.setDrawColor(217, 214, 204); doc.setLineWidth(0.2); doc.line(ML, y - lh + 1, ML + CW, y - lh + 1);
      }
      row(cols.map(cl => cl.h), true, true); rows.forEach(rw => row(rw, false, false)); y += 2;
    }
    doc.setFillColor.apply(doc, navy); doc.rect(0, 0, W, 30, 'F'); doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('CX AI Fit Assessment', ML, 13);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(`${A.name || 'Untitled'}  ·  ${A.date || ''}`, ML, 21); y = 40;
    heading('1. The answer on one page');
    table([{ h: '', w: 48 }, { h: '', w: CW - 48 }], [
      ['Automatable share', `${pct(c.automatable, 1)} of ${c.vol.toLocaleString('en-GB')} contacts a month`],
      ['Recommended path', c.path],
      ['Top candidates', c.phase1.slice(0, 5).map(x => x.name).join('; ') || 'none qualify yet'],
      ['Fix first', [...c.readinessFixes.map(f => `${f.dim} (${f.score})`), ...c.fixFirst.map(x => x.name)].join('; ') || 'nothing'],
      ['You need', r.needs.join(', ') || '-'], ["You probably don't need", r.whatNot.join(', ') || 'nothing stands out']]);
    heading('2. Intent map');
    table([{ h: 'Intent', w: 58 }, { h: 'Share', w: 16, num: true }, { h: 'Type', w: 46 }, { h: 'Opp.', w: 16, num: true }, { h: 'Value/yr', w: 22, num: true }, { h: 'Status', w: CW - 158 }],
      c.rows.filter(x => x.name).slice().sort((x, y2) => (y2.opp || 0) - (x.opp || 0)).map(x => [x.name, pct(x.share), x.type || '', x.opp == null ? '' : pct(x.opp, 1), gbp(x.value), x.status]));
    heading('3. Readiness scorecard');
    table([{ h: 'Dimension', w: 40 }, { h: 'Score', w: 16, num: true }, { h: 'The fix, if under 3', w: CW - 56 }], DIMS.map(d => { const s = num(A.readiness[d.key]); return [d.key, s == null ? '-' : s, s != null && s < 3 ? 'Get to 3: ' + d.three : '']; }));
    if (c.gate) text('People gate: no platform yet. Name an owner first.', 10, { bold: true });
    heading('4. Fit ranking');
    if (c.ranking.length) table([{ h: '#', w: 10, num: true }, { h: 'Platform', w: 80 }, { h: 'Fit', w: 18, num: true }, { h: 'Over-spec', w: 22, num: true }, { h: 'Cost band', w: CW - 130 }], c.ranking.map(x => [x.rank, x.name, pct(x.fit), x.over, x.band]));
    else text('No platform fully scored and within budget.', 10);
    if (c.overBudget.length) text('Over budget: ' + c.overBudget.map(x => `${x.name} (would score ${pct(x.fit)})`).join(', '), 9, { color: grey });
    if (c.unscored.length) text(`${c.unscored.length} platform rows are not fully scored and are left out.`, 9, { color: grey });
    heading('5. Phase 1 plan');
    text(c.phase1.length ? `Two or three of: ${c.phase1.slice(0, 3).map(x => x.name).join(', ')}. Eight to twelve weeks. Measure containment, CSAT on bot journeys and repeat contact. Stop rule: containment under half the target at week eight.` : 'No Phase 1 yet. Clear the fix-first list, then re-run.', 10);
    heading('6. Business case (illustrative)');
    text(`Automatable contacts are worth about ${gbp(c.value)} a year at £${(num(q.cost) || 0).toFixed(2)} a contact. Goal: ${q.goal || '-'}. Target: ${q.target || 'none set'}. Budget band: ${q.budget || 'not set'}. Live by: ${q.liveby || '-'}.`, 10);
    heading('7. Risks and constraints');
    text(`Constraints in scope: ${r.constraints.join(', ') || 'none flagged'}${q.residency ? '; hosting ' + q.residency : ''}${q.access ? '; ' + q.access : ''}.`, 10);
    text(`Previous automation: ${q.prior || 'none recorded'}.`, 10); text(`Failure in 12 months would look like: ${q.failure || 'not stated'}.`, 10); text(`Contracts: ${q.contracts || 'not recorded'}. AI policy: ${q.aipolicy || 'not stated'}.`, 10);
    heading('8. What we need from you to start');
    text(`A named owner for the bot after go-live (currently: ${q.owner || 'not named'}). Three months of contact data with reason codes. API access to: ${q.backoffice || 'the systems behind the Phase 1 intents'}. Sign-off: ${q.signoff || 'to be named'}.`, 10);
    y += 4; text("Every number is illustrative until the client's actuals replace the model's. Opportunity = share x automatability x risk factor. Fit = sum(weight x score) / (3 x sum weight). Over-spec = scores in columns the profile weights 0. Thresholds are illustrative until calibrated on the first five clients.", 8, { color: grey });
    try { doc.save(`fit-assessment-${slug(A.name)}.pdf`); toast('PDF ready'); } catch (e) { toast('PDF could not be saved in this browser.'); }
  }

  /* ---------------------------------------------------------------- Settings */
  function renderSettings(m) {
    const p = h(`<div class="panel"><div class="toolbar"><div><h2>Settings</h2><p class="lead" style="margin:0">Factors and thresholds behind the scoring. All illustrative until calibrated on real clients. Settings travel with an exported matrix file.</p></div><div class="spacer"></div>
      <button id="btnResetSettings">Reset to defaults</button><button id="btnSaveSettings" class="primary">Save settings</button></div>
      <div class="settings-grid">
        <div><h3>Automatability factor</h3>${INTENT_TYPES.map(t => `<label><span>${esc(t)}</span><input type="number" step="0.1" min="0" max="1" data-auto="${esc(t)}" value="${S.auto[t]}"></label>`).join('')}</div>
        <div><h3>Risk factor</h3>${RISKS.map(t => `<label><span>${esc(t)} consequence</span><input type="number" step="0.1" min="0" max="1" data-risk="${esc(t)}" value="${S.risk[t]}"></label>`).join('')}
          <h3 style="margin-top:14px">Phase 1</h3>${THRESHOLD_LABELS.filter(t => t[2] === 'num').map(t => `<label><span>${esc(t[1])}</span><input type="number" step="1" min="0" data-thr="${t[0]}" value="${S[t[0]]}"></label>`).join('')}</div>
        <div><h3>Thresholds (%)</h3>${THRESHOLD_LABELS.filter(t => t[2] === 'pct').map(t => `<label><span>${esc(t[1])}</span><input type="number" step="1" min="0" max="100" data-thr="${t[0]}" data-pct="1" value="${Math.round(S[t[0]] * 100)}"></label>`).join('')}</div>
      </div>
      <p class="helpline">Weights fixed by rule: Agent handoff 3, Pricing model 2. Chat and messaging 3 at 10% messaging share. Knowledge 2 at 20% informational share. Integration 2 at 10% transactional share.</p>
      <h3 style="margin-top:16px">This browser</h3><p class="note">Assessments, the matrix and settings are stored in this browser only. Use Export on the top bar and Export matrix on the Fit matrix tab to move them to another machine or share them with the team.</p>
      <p style="margin-top:8px"><button id="btnWipe" class="quiet">Clear everything stored in this browser</button></p></div>`);
    p.querySelectorAll('input[data-auto]').forEach(i => { i.oninput = e => { const n = num(e.target.value); S.auto[i.dataset.auto] = n == null ? 0 : n; settingsDirty = true; updateStatus(); }; });
    p.querySelectorAll('input[data-risk]').forEach(i => { i.oninput = e => { const n = num(e.target.value); S.risk[i.dataset.risk] = n == null ? 0 : n; settingsDirty = true; updateStatus(); }; });
    p.querySelectorAll('input[data-thr]').forEach(i => { i.oninput = e => { const n = num(e.target.value); if (n == null) return; S[i.dataset.thr] = i.dataset.pct ? n / 100 : n; settingsDirty = true; updateStatus(); }; });
    p.querySelector('#btnResetSettings').onclick = () => { S = clone(SETTINGS_DEFAULT); settingsDirty = true; updateStatus(); render(); };
    p.querySelector('#btnSaveSettings').onclick = saveSettings;
    p.querySelector('#btnWipe').onclick = async () => { if (await confirmDialog('Clear every saved assessment, the matrix and settings from this browser? Export anything you want to keep first.')) { Object.values(KEYS).forEach(lsDel); saved = {}; M = clone(MATRIX_DEFAULT); S = clone(SETTINGS_DEFAULT); matrixDirty = settingsDirty = false; loadAssessment(EXAMPLE); toast('Cleared'); } };
    m.appendChild(p);
  }

  /* ---------------------------------------------------------------- picker, status, persistence */
  function savedList() { return Object.values(saved).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)); }
  function renderPicker() {
    const sel = $('#picker'); const cur = A ? A.id : ''; sel.innerHTML = '';
    const opts = []; if (A && !saved[A.id]) opts.push({ id: A.id, label: (A.name || 'Untitled') + (A.example ? '' : ' (unsaved)') });
    savedList().forEach(s => opts.push({ id: s.id, label: s.name || 'Untitled' }));
    opts.push({ id: '__example', label: 'Load example (illustrative)' });
    opts.forEach(o => { const op = document.createElement('option'); op.value = o.id; op.textContent = o.label; sel.appendChild(op); });
    sel.value = cur;
  }
  function updateStatus() {
    const chip = $('#statusChip'); let cls = 'good', txt = 'Saved';
    if (dirty || matrixDirty || settingsDirty) { cls = 'amber'; txt = 'Unsaved: ' + [dirty ? 'assessment' : '', matrixDirty ? 'matrix' : '', settingsDirty ? 'settings' : ''].filter(Boolean).join(', '); }
    chip.className = 'chip ' + cls; chip.textContent = txt;
    $('#btnDelete').disabled = !A || !saved[A.id];
  }
  function saveAssessment() {
    if (!A) return;
    if (!A.name) { toast('Give the client a name first (Questionnaire tab).'); tab = 'questionnaire'; render(); return; }
    const body = clone(A); delete body.example; body.updatedAt = Date.now();
    saved[body.id] = body; if (!persistSaved()) { toast('Could not save: browser storage is unavailable or full.'); return; }
    A.example = false; A.updatedAt = body.updatedAt; dirty = false; lsSet(KEYS.draft, JSON.stringify(A)); toast('Saved in this browser'); updateStatus(); renderPicker();
  }
  function saveMatrix() { if (lsSet(KEYS.matrix, JSON.stringify(M))) { matrixDirty = false; toast('Matrix saved in this browser'); } else toast('Could not save: browser storage is unavailable or full.'); updateStatus(); }
  function saveSettings() { if (lsSet(KEYS.settings, JSON.stringify(S))) { settingsDirty = false; toast('Settings saved in this browser'); } else toast('Could not save: browser storage is unavailable or full.'); updateStatus(); }
  async function deleteAssessment() {
    if (!A || !saved[A.id]) return;
    if (!(await confirmDialog(`Delete "${A.name || 'this assessment'}" from this browser? This cannot be undone.`))) return;
    delete saved[A.id]; persistSaved(); toast('Deleted'); lsDel(KEYS.draft);
    const next = savedList()[0]; if (next) loadAssessment(next); else loadAssessment(EXAMPLE);
  }
  async function switchTo(id) {
    if (dirty && !(await confirmDialog('You have unsaved changes to the current assessment. Discard them?'))) { renderPicker(); return; }
    if (id === '__example') { loadAssessment(EXAMPLE); tab = 'results'; render(); return; }
    if (A && id === A.id) return;
    if (saved[id]) { loadAssessment(saved[id]); tab = 'results'; render(); }
  }
  function exportJson() { if (!A) return; downloadFile(`fit-assessment-${slug(A.name)}.json`, JSON.stringify({ kind: 'cx-ai-fit-assessment', version: 1, assessment: A, matrix: M, settings: S }, null, 2), 'application/json'); toast('Exported'); }
  function importJson(file) {
    const rd = new FileReader();
    rd.onload = async () => {
      try {
        const obj = JSON.parse(rd.result); const a = obj.assessment || obj; if (!a.q || !a.intents) throw new Error('not an assessment');
        if (dirty && !(await confirmDialog('You have unsaved changes to the current assessment. Discard them and import?'))) return;
        a.id = newId(); delete a.example; loadAssessment(a, { dirty: true });
        if (obj.matrix && obj.matrix.platforms && await confirmDialog('This file also carries a fit matrix and settings. Replace yours with them?')) { M = normaliseMatrix(obj.matrix); matrixDirty = true; if (obj.settings) { S = normaliseSettings(obj.settings); settingsDirty = true; } }
        tab = 'results'; render(); updateStatus(); toast('Imported as a new assessment. Save to keep it.');
      } catch (e) { toast('That file is not an assessment export.'); }
    };
    rd.readAsText(file);
  }
  function applyTheme(t) { const root = document.documentElement; if (t === 'dark' || t === 'light') root.setAttribute('data-theme', t); else root.removeAttribute('data-theme'); }
  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme');
    const sysDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = cur ? cur === 'dark' : sysDark; const next = isDark ? 'light' : 'dark'; applyTheme(next); lsSet(KEYS.theme, next);
  }

  /* ---------------------------------------------------------------- boot */
  function wire() {
    $('#btnSave').onclick = saveAssessment; $('#btnDelete').onclick = deleteAssessment; $('#btnExport').onclick = exportJson;
    $('#btnImport').onclick = () => $('#fileImport').click(); $('#fileImport').onchange = e => { const f = e.target.files && e.target.files[0]; if (f) importJson(f); e.target.value = ''; };
    $('#btnNew').onclick = async () => { if (dirty && !(await confirmDialog('You have unsaved changes to the current assessment. Discard them?'))) return; loadAssessment(blankAssessment(), { dirty: true }); tab = 'questionnaire'; render(); };
    $('#picker').onchange = e => switchTo(e.target.value);
    $('#btnTheme').onclick = toggleTheme;
    $('#brandLine').textContent = BRAND;
    window.addEventListener('beforeunload', e => { if (dirty || matrixDirty || settingsDirty) { e.preventDefault(); e.returnValue = ''; } });
  }
  function start() {
    applyTheme(lsGet(KEYS.theme));
    wire();
    const t = lsGet(KEYS.tab); if (t && TABS.some(x => x[0] === t)) tab = t;
    saved = lsJson(KEYS.assessments, {}); if (typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    M = normaliseMatrix(lsJson(KEYS.matrix, MATRIX_DEFAULT));
    S = normaliseSettings(lsJson(KEYS.settings, SETTINGS_DEFAULT));
    const draft = lsJson(KEYS.draft, null);
    if (draft && draft.q) { A = normalise(draft); dirty = !draft.example && !(saved[draft.id] && JSON.stringify(normalise(saved[draft.id])) === JSON.stringify(A)); }
    else { const last = savedList()[0]; A = normalise(last || EXAMPLE); }
    render(); updateStatus();
  }
  window.CXFitApp = { get state() { return { A, M, S, tab }; }, compute: () => compute(A, M, S), render, loadAssessment };
  start();
})();
