/* CX AI Fit Assessment: scoring engine.
   Pure functions and reference data. No DOM. Loads in a browser as window.CXFit and in Node via require().
   Mirrors model/cx_ai_fit_assessment_v0.xlsx; test/engine.test.js checks the two agree. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CXFit = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CAPS = [
    { key: 'voice', name: 'Voice', three: 'Phone-grade ASR and NLU, barge-in, copes with bad lines' },
    { key: 'chat', name: 'Chat and messaging', three: 'Web, app, WhatsApp and social from one build' },
    { key: 'langs', name: 'Languages', three: "Native NLU in the client's languages, not translation bolted on" },
    { key: 'knowledge', name: 'Knowledge and RAG', three: 'Answers from the help centre with citations and controls on what it can say' },
    { key: 'integration', name: 'Integration tooling', three: 'API actions a configurer can build, not a developer' },
    { key: 'agentic', name: 'Agentic actions', three: 'Multi-step tasks with guardrails and a human stop' },
    { key: 'auth', name: 'Auth handling', three: 'OTP, token exchange, CRM lookup out of the box' },
    { key: 'handoff', name: 'Agent handoff', three: "Context carried into the client's ticketing or CCaaS" },
    { key: 'build', name: 'Build model', three: 'A non-developer can build and change flows' },
    { key: 'analytics', name: 'Analytics and intent discovery', three: 'Shows what the bot missed, not only what it answered' },
    { key: 'pricing', name: 'Pricing model', three: 'Per conversation or per resolution, no platform fee' },
    { key: 'team', name: 'Minimum team to run', three: 'One part-time owner, no developer' },
    { key: 'compliance', name: 'Compliance and residency', three: 'UK or EU hosting, PCI options, audit trail' },
  ];
  const INTENT_TYPES = ['Informational, content exists', 'Informational, content needs writing', 'Transactional, API exists', 'Transactional, no API', 'Complex', 'Regulated'];
  const RISKS = ['Low', 'Medium', 'High'];
  const BANDS = ['Under £50k', '£50k to £150k', '£150k to £400k', 'Over £400k'];
  const DIMS = [
    { key: 'Data', one: 'No reason codes, no exports', three: 'Reason codes exist but messy', five: 'Clean taxonomy, exports on tap' },
    { key: 'Knowledge', one: 'No help centre, or badly out of date', three: 'Exists, partly maintained', five: 'Current, owned, agents use it' },
    { key: 'Integration', one: 'No APIs, systems locked down', three: 'Some APIs, IT will help', five: 'API-first, auth solved' },
    { key: 'People', one: 'Nobody to own it', three: 'Owner named, no skills yet', five: 'Owner plus someone who can build and maintain' },
    { key: 'Governance', one: 'No policy, blockers unknown', three: 'Constraints known, no sign-off process', five: 'AI policy, sign-off and review in place' },
  ];
  const LISTS = {
    yesno: ['Yes', 'No'], owner: ['Nobody yet', 'CX team', 'IT', 'Vendor', 'Partner'], skills: ['None', 'Some', 'Yes'],
    residency: ['Any cloud', 'EU', 'UK only'], selfserve: ['None', 'Help centre', 'IVR', 'Bot', 'Several'], aipolicy: ['Approved', 'Drafting', 'None'],
    goal: ['Cost per contact', 'CSAT', '24/7 cover', 'Agent load', 'Consistency'], custtype: ['Consumers', 'Businesses', 'Citizens', 'Employees'], budget: BANDS,
  };
  const QSCHEMA = [
    { section: 'A. Contact profile', items: [
      { key: 'voice', code: 'A1a', label: 'Voice contacts per month', kind: 'num', feeds: 'Profile: volume, voice share' },
      { key: 'chat', code: 'A1b', label: 'Chat contacts per month', kind: 'num', feeds: 'Profile: volume, messaging share' },
      { key: 'email', code: 'A1c', label: 'Email contacts per month', kind: 'num', feeds: 'Profile: volume' },
      { key: 'social', code: 'A1d', label: 'Social contacts per month', kind: 'num', feeds: 'Profile: volume, messaging share' },
      { key: 'inapp', code: 'A1e', label: 'In-app contacts per month', kind: 'num', feeds: 'Profile: volume, messaging share' },
      { key: 'other', code: 'A1f', label: 'Other contacts per month', kind: 'num', feeds: 'Profile: volume' },
      { key: 'ooh', code: 'A2', label: 'Share of contacts arriving out of hours', kind: 'pct', feeds: 'Profile: 24/7 case' },
      { key: 'peak', code: 'A3', label: 'Peak month divided by quietest month', kind: 'num', step: '0.1', feeds: 'Profile: elasticity' },
      { key: 'langs', code: 'A4', label: 'Number of languages customers contact you in', kind: 'num', feeds: 'Profile: languages' },
      { key: 'langlist', code: 'A4b', label: 'Which languages, with rough share', kind: 'text', feeds: 'Report' },
      { key: 'custtype', code: 'A5', label: 'Who the customers are', kind: 'pick', list: 'custtype', feeds: 'Profile: tone, auth model' },
      { key: 'auth', code: 'A6', label: 'Must customers be identified before you can help?', kind: 'pick', list: 'yesno', feeds: 'Profile: auth needed' },
      { key: 'authhow', code: 'A6b', label: 'How are they identified today?', kind: 'text', feeds: 'Report' },
    ] },
    { section: 'B. Intents', note: 'B1 to B4 are on the Intents tab.', items: [
      { key: 'repeat', code: 'B5a', label: 'Repeat contact rate', kind: 'pct', feeds: 'Opportunity: value. Readiness: data' },
      { key: 'fcr', code: 'B5b', label: 'First contact resolution', kind: 'pct', feeds: 'Opportunity: value. Readiness: data' },
      { key: 'selfserve', code: 'B6a', label: 'Self-service today', kind: 'pick', list: 'selfserve', feeds: 'Profile: baseline' },
      { key: 'contain', code: 'B6b', label: 'Containment rate today, if known', kind: 'pct', feeds: 'Profile: baseline' },
      { key: 'cost', code: 'B7', label: 'Blended cost per contact (£)', kind: 'num', step: '0.01', feeds: 'Opportunity: value' },
    ] },
    { section: 'C. Systems', items: [
      { key: 'ticketing', code: 'C1', label: 'Ticketing or CRM platform and version', kind: 'text', feeds: 'Profile: handoff target' },
      { key: 'telephony', code: 'C2', label: 'Telephony or contact centre platform', kind: 'text', feeds: 'Profile: voice handoff' },
      { key: 'backoffice', code: 'C3', label: 'Back-office systems behind the top transactional intents, API available, owner', kind: 'long', feeds: 'Readiness: integration' },
      { key: 'authreuse', code: 'C4', label: 'Could a bot reuse the current verification method?', kind: 'pick', list: 'yesno', feeds: 'Readiness: integration. Profile: auth' },
      { key: 'residency', code: 'C5', label: 'Hosting or data residency constraint', kind: 'pick', list: 'residency', feeds: 'Profile: constraints' },
    ] },
    { section: 'D. Knowledge', items: [
      { key: 'hc', code: 'D1a', label: 'Public help centre?', kind: 'pick', list: 'yesno', feeds: 'Readiness: knowledge' },
      { key: 'hcdetail', code: 'D1b', label: 'Help centre platform and article count', kind: 'text', feeds: 'Readiness: knowledge' },
      { key: 'hcreview', code: 'D2a', label: 'Last reviewed end to end', kind: 'text', feeds: 'Readiness: knowledge' },
      { key: 'hcowner', code: 'D2b', label: 'Who owns it (role)', kind: 'text', feeds: 'Readiness: knowledge' },
      { key: 'agentsuse', code: 'D3', label: 'Do agents use it, or their own notes and macros?', kind: 'text', feeds: 'Readiness: knowledge' },
      { key: 'ikb', code: 'D4', label: 'Internal knowledge base agents trust?', kind: 'pick', list: 'yesno', feeds: 'Readiness: knowledge' },
      { key: 'tone', code: 'D5', label: 'Tone of voice or brand guidelines for written contact?', kind: 'pick', list: 'yesno', feeds: 'Profile: content effort' },
    ] },
    { section: 'E. People', items: [
      { key: 'owner', code: 'E1', label: 'Who would own the bot day to day after go-live?', kind: 'pick', list: 'owner', feeds: 'Readiness: people (gate)' },
      { key: 'skills', code: 'E2', label: 'Anyone in-house who builds flows, writes prompts or manages NLU?', kind: 'pick', list: 'skills', feeds: 'Readiness: people. Profile: build model' },
      { key: 'agents', code: 'E3a', label: 'Agent headcount', kind: 'num', feeds: 'Opportunity: value' },
      { key: 'attrition', code: 'E3b', label: 'Agent attrition, annual', kind: 'pct', feeds: 'Opportunity: value' },
      { key: 'prior', code: 'E4', label: 'Tried automation before? What happened, and why?', kind: 'long', feeds: 'Readiness: people. Report: risks' },
      { key: 'signoff', code: 'E5', label: 'Who signs off the business case, and who signs off what the bot may say?', kind: 'text', feeds: 'Readiness: governance' },
    ] },
    { section: 'F. Constraints', items: [
      { key: 'pci', code: 'F1a', label: 'PCI in scope (card payments)', kind: 'pick', list: 'yesno', feeds: 'Profile: constraints' },
      { key: 'gdpr', code: 'F1b', label: 'GDPR special category data (vulnerability, health)', kind: 'pick', list: 'yesno', feeds: 'Profile: constraints' },
      { key: 'fca', code: 'F1c', label: 'FCA regulated', kind: 'pick', list: 'yesno', feeds: 'Profile: constraints' },
      { key: 'pub', code: 'F1d', label: 'Public sector', kind: 'pick', list: 'yesno', feeds: 'Profile: constraints' },
      { key: 'health', code: 'F1e', label: 'Health', kind: 'pick', list: 'yesno', feeds: 'Profile: constraints' },
      { key: 'access', code: 'F2', label: 'Accessibility requirement', kind: 'text', feeds: 'Profile: constraints' },
      { key: 'contracts', code: 'F3', label: 'Vendor contracts and renewal dates (ticketing, telephony, any bot)', kind: 'text', feeds: 'Profile: procurement timing' },
      { key: 'procure', code: 'F4', label: 'Procurement route', kind: 'text', feeds: 'Profile: procurement' },
      { key: 'aipolicy', code: 'F5', label: 'Policy on AI use with customers', kind: 'pick', list: 'aipolicy', feeds: 'Readiness: governance' },
    ] },
    { section: 'G. Goals and budget', items: [
      { key: 'goal', code: 'G1', label: 'Main goal, one only', kind: 'pick', list: 'goal', feeds: 'Profile: goal' },
      { key: 'target', code: 'G2', label: 'Target, if they have one (illustrative until measured)', kind: 'text', feeds: 'Report' },
      { key: 'budget', code: 'G3', label: 'Budget band for year one, licences and build together', kind: 'pick', list: 'budget', feeds: 'Fit: price filter' },
      { key: 'liveby', code: 'G4', label: 'Live-by date, and why that date', kind: 'text', feeds: 'Report' },
      { key: 'failure', code: 'G5', label: 'What would make this a failure in 12 months?', kind: 'long', feeds: 'Report: risks' },
    ] },
  ];

  const SETTINGS_DEFAULT = {
    auto: { 'Informational, content exists': 1.0, 'Informational, content needs writing': 0.8, 'Transactional, API exists': 0.9, 'Transactional, no API': 0.5, 'Complex': 0.2, 'Regulated': 0 },
    risk: { Low: 1.0, Medium: 0.8, High: 0.5 },
    noPlatformBelow: 0.15, fullPlatformAbove: 0.35, voiceHeavyAbove: 0.40, transHeavyAbove: 0.25,
    voiceW3: 0.40, voiceW1: 0.10, integW3: 0.25, knowW3: 0.40, langsMoreThan: 2, topN: 5, readyMin: 3,
  };
  const THRESHOLD_LABELS = [
    ['noPlatformBelow', 'No platform below this automatable share', 'pct'],
    ['fullPlatformAbove', 'Full platform above this automatable share', 'pct'],
    ['voiceHeavyAbove', 'Voice heavy above this voice share of volume', 'pct'],
    ['transHeavyAbove', 'Transactional heavy above this transactional share of volume', 'pct'],
    ['voiceW3', 'Voice weight 3 above this voice share', 'pct'],
    ['voiceW1', 'Voice weight 1 above this voice share', 'pct'],
    ['integW3', 'Integration weight 3 above this transactional share', 'pct'],
    ['knowW3', 'Knowledge weight 3 above this informational share', 'pct'],
    ['langsMoreThan', 'Languages weight 2 when more than this many', 'num'],
    ['topN', 'Top-quartile count of 20 intents', 'num'],
    ['readyMin', 'Readiness minimum for Phase 1', 'num'],
  ];

  function blankScores() { const s = {}; CAPS.forEach(c => { s[c.key] = null; }); return s; }
  function scoresFrom(arr) { const s = {}; CAPS.forEach((c, i) => { s[c.key] = arr[i]; }); return s; }
  const MATRIX_DEFAULT = { platforms: [
    { id: 'p-native', name: "Help centre plus ticketing vendor's native bot", band: '', scores: blankScores() },
    { id: 'p-ultimate', name: 'Ultimate AI / Zendesk AI agents', band: '', scores: blankScores() },
    { id: 'p-cognigy', name: 'Cognigy (NiCE)', band: '', scores: blankScores() },
    { id: 'p-omilia', name: 'Omilia', band: '', scores: blankScores() },
    { id: 'p-polyai', name: 'PolyAI', band: '', scores: blankScores() },
    { id: 'p-cxone', name: 'NICE CXone native bots', band: '', scores: blankScores() },
    { id: 'p-copilot', name: 'Microsoft Copilot Studio / Azure', band: '', scores: blankScores() },
    { id: 'p-exa', name: 'Example platform A (illustrative)', band: '£50k to £150k', scores: scoresFrom([3, 2, 1, 2, 2, 1, 2, 3, 2, 2, 2, 2, 3]) },
    { id: 'p-exb', name: 'Example platform B (illustrative)', band: '£150k to £400k', scores: scoresFrom([3, 3, 3, 3, 3, 3, 3, 3, 1, 3, 1, 1, 3]) },
    { id: 'p-exc', name: 'Example platform C (illustrative)', band: 'Under £50k', scores: scoresFrom([0, 3, 1, 3, 1, 0, 1, 2, 3, 2, 3, 3, 2]) },
  ] };

  const EXAMPLE = {
    id: 'example', name: 'Example Energy Co (illustrative)', date: '2026-10-05', example: true,
    q: { voice: 18000, chat: 6000, email: 9000, social: 500, inapp: 1500, other: 0, ooh: 0.22, peak: 1.6, langs: 2, langlist: 'English 94%, Welsh 6%', custtype: 'Consumers', auth: 'Yes', authhow: 'Account number plus postcode',
      repeat: 0.18, fcr: 0.72, selfserve: 'Help centre', contain: 0.08, cost: 4.5,
      ticketing: 'Zendesk Suite', telephony: 'NICE CXone', backoffice: 'Billing (API yes, IT), Scheduling (no API, Ops)', authreuse: 'Yes', residency: 'UK only',
      hc: 'Yes', hcdetail: 'Zendesk Guide, 140 articles', hcreview: '2025-03', hcowner: 'Digital content lead, part time', agentsuse: 'Own notes', ikb: 'No', tone: 'Yes',
      owner: 'CX team', skills: 'Some', agents: 85, attrition: 0.28, prior: 'IVR menu in 2023, abandoned, nobody owned it', signoff: 'COO / Head of Customer Service',
      pci: 'Yes', gdpr: 'Yes', fca: 'No', pub: 'No', health: 'No', access: 'WCAG 2.2 AA', contracts: 'Zendesk renews Apr 2027, CXone Sep 2027', procure: 'Direct, under tender threshold', aipolicy: 'Drafting',
      goal: 'Cost per contact', target: '30% containment on chat in year one', budget: '£150k to £400k', liveby: '2027-03, before Zendesk renewal', failure: 'Containment under 15%, or complaints up' },
    intents: [
      ['Submit a meter reading', 0.11, 'Transactional, API exists', 'Low', 'Billing API'],
      ['Make a payment', 0.09, 'Transactional, API exists', 'Medium', 'Payment gateway, PCI'],
      ['Bill explanation (why is it higher)', 0.10, 'Complex', 'Medium', ''],
      ['Moving home', 0.06, 'Transactional, no API', 'Medium', 'Manual in billing'],
      ['Update contact details', 0.05, 'Transactional, API exists', 'Low', 'CRM API'],
      ['Payment plan or arrears', 0.06, 'Regulated', 'High', 'Must be human'],
      ['Change direct debit date', 0.04, 'Transactional, API exists', 'Low', 'Billing API'],
      ['Book smart meter appointment', 0.05, 'Transactional, no API', 'Medium', 'Scheduling, no API'],
      ['Tariff information', 0.04, 'Informational, content exists', 'Low', ''],
      ['Power cut or supply issue', 0.03, 'Regulated', 'High', 'Network operator'],
      ['Refund request', 0.03, 'Transactional, no API', 'Medium', 'Finance queue'],
      ['Complaint', 0.04, 'Complex', 'High', ''],
      ['How to read my meter', 0.02, 'Informational, content exists', 'Low', ''],
      ['Account balance', 0.05, 'Transactional, API exists', 'Low', 'Billing API'],
      ['Switching provider or leaving', 0.03, 'Complex', 'Medium', ''],
      ['Priority services register', 0.02, 'Regulated', 'High', 'Vulnerability, human'],
      ['App or login problems', 0.03, 'Informational, content needs writing', 'Low', ''],
      ['Energy saving advice', 0.02, 'Informational, content needs writing', 'Low', ''],
      ['Warm home discount eligibility', 0.03, 'Informational, content exists', 'Medium', ''],
      ['Change tariff', 0.03, 'Transactional, API exists', 'Medium', 'Billing API'],
    ].map(r => ({ name: r[0], share: r[1], type: r[2], risk: r[3], note: r[4] })),
    readiness: { Data: 3, Knowledge: 2, Integration: 4, People: 3, Governance: 3 },
  };

  function num(v) { const n = typeof v === 'number' ? v : parseFloat(v); return isFinite(n) ? n : null; }

  /* compute(assessment, matrix, settings) -> results. Every rule here has a twin in the spreadsheet. */
  function compute(a, matrix, S) {
    const q = a.q || {};
    const vol = ['voice', 'chat', 'email', 'social', 'inapp', 'other'].reduce((t, k) => t + (num(q[k]) || 0), 0);
    const voiceShare = vol ? (num(q.voice) || 0) / vol : 0;
    const msgShare = vol ? ((num(q.chat) || 0) + (num(q.social) || 0) + (num(q.inapp) || 0)) / vol : 0;
    const R = a.readiness || {};
    const people = num(R.People);
    const cost = num(q.cost) || 0;
    const rows = (a.intents || []).map((it, idx) => {
      const share = num(it.share);
      const A = it.type ? (S.auto[it.type] != null ? S.auto[it.type] : null) : null;
      const Rf = it.risk ? (S.risk[it.risk] != null ? S.risk[it.risk] : null) : null;
      const opp = (share != null && A != null && Rf != null) ? share * A * Rf : null;
      const value = opp != null ? vol * opp * cost * 12 : null;
      let dep = null;
      if (it.type) dep = it.type.startsWith('Informational') ? 'Knowledge' : it.type.startsWith('Transactional') ? 'Integration' : 'People';
      const depScore = dep ? Math.min(num(R[dep]) == null ? 0 : num(R[dep]), people == null ? 0 : people) : null;
      return { idx, name: it.name, share, type: it.type, risk: it.risk, note: it.note, A, Rf, opp, value, dep, depScore, rank: null, status: '' };
    });
    const opps = rows.filter(r => r.opp != null).map(r => r.opp);
    rows.forEach(r => {
      if (r.opp == null) return;
      r.rank = 1 + opps.filter(o => o > r.opp).length;           // Excel RANK: ties share the higher rank
      if (r.A === 0) r.status = 'Regulated, stays human';
      else if (r.opp > 0 && r.rank <= S.topN) r.status = (r.depScore != null && r.depScore >= S.readyMin) ? 'Phase 1' : 'Fix first';
      else r.status = (r.depScore != null && r.depScore >= S.readyMin) ? 'Later' : 'Leave with humans';
    });
    const automatable = opps.reduce((t, o) => t + o, 0);
    const value = rows.reduce((t, r) => t + (r.value || 0), 0);
    const infoShare = rows.filter(r => r.type && r.type.startsWith('Informational')).reduce((t, r) => t + (r.share || 0), 0);
    const transShare = rows.filter(r => r.type && r.type.startsWith('Transactional')).reduce((t, r) => t + (r.share || 0), 0);
    const dims = DIMS.map(d => num(R[d.key])).filter(v => v != null);
    const avgReady = dims.length ? dims.reduce((t, v) => t + v, 0) / dims.length : null;
    const gate = (people != null && people <= 1);
    let path;
    if (gate) path = 'No platform yet. Name an owner first.';
    else if (automatable < S.noPlatformBelow) path = 'No platform. Fix the help centre and the top three processes.';
    else if (automatable < S.fullPlatformAbove) path = transShare >= S.transHeavyAbove ? 'Platform with integration tooling. Phase 1 is two intents that already have APIs.' : "Knowledge-led bot on a lighter platform, or the ticketing vendor's own AI.";
    else path = voiceShare >= S.voiceHeavyAbove ? 'Full platform, voice-capable first, chat second.' : 'Full platform. Voice only if the voice share earns it.';
    const dataScore = num(R.Data);
    const regulated = ['pci', 'gdpr', 'fca', 'pub', 'health'].some(k => q[k] === 'Yes') || q.residency === 'UK only';
    const langs = num(q.langs) || 0;
    const weights = {
      voice: voiceShare >= S.voiceW3 ? 3 : voiceShare >= S.voiceW1 ? 1 : 0,
      chat: msgShare >= 0.1 ? 3 : msgShare > 0 ? 1 : 0,
      langs: langs > S.langsMoreThan ? 2 : 0,
      knowledge: infoShare >= S.knowW3 ? 3 : infoShare >= 0.2 ? 2 : 1,
      integration: transShare >= S.integW3 ? 3 : transShare >= 0.1 ? 2 : 1,
      agentic: transShare >= S.integW3 ? 2 : 0,
      auth: q.auth === 'Yes' ? 3 : 0,
      handoff: 3,
      build: q.skills === 'None' ? 3 : q.skills === 'Some' ? 1 : 0,
      analytics: (dataScore != null && dataScore <= 2) ? 3 : 2,
      pricing: 2,
      team: (people != null && people <= 2) ? 3 : 1,
      compliance: regulated ? 3 : 0,
    };
    const wsum = CAPS.reduce((t, c) => t + weights[c.key], 0);
    const budgetIdx = BANDS.indexOf(q.budget) + 1;              // 0 = not set
    const platforms = (matrix.platforms || []).map(p => {
      const sc = p.scores || {};
      const scored = CAPS.filter(c => num(sc[c.key]) != null).length;
      const full = scored === CAPS.length;
      const fit = full ? (wsum ? CAPS.reduce((t, c) => t + weights[c.key] * num(sc[c.key]), 0) / (3 * wsum) : 0) : null;
      const over = full ? CAPS.reduce((t, c) => t + (weights[c.key] === 0 ? num(sc[c.key]) : 0), 0) : null;
      const bandIdx = BANDS.indexOf(p.band) + 1;
      const budget = !p.band ? '' : budgetIdx === 0 ? 'No budget set' : bandIdx <= budgetIdx ? 'Yes' : 'Over budget';
      return { id: p.id, name: p.name, band: p.band, scored, full, fit, over, budget, rank: null };
    });
    const rankable = platforms.filter(p => p.fit != null && p.budget === 'Yes');
    rankable.forEach(p => { p.rank = 1 + rankable.filter(o => o.fit > p.fit).length; });
    const ranking = rankable.slice().sort((x, y) => x.rank - y.rank);
    return {
      vol, voiceShare, msgShare, rows, automatable, value, infoShare, transShare, avgReady, gate, path, people, weights, wsum, budgetIdx, platforms, ranking,
      phase1: rows.filter(r => r.status === 'Phase 1').sort((x, y) => y.opp - x.opp),
      fixFirst: rows.filter(r => r.status === 'Fix first').sort((x, y) => y.opp - x.opp),
      readinessFixes: DIMS.filter(d => num(R[d.key]) != null && num(R[d.key]) < 3).map(d => ({ dim: d.key, score: num(R[d.key]), three: d.three })),
      unscored: platforms.filter(p => !p.full),
      overBudget: platforms.filter(p => p.budget === 'Over budget' && p.full),
    };
  }

  return { CAPS, INTENT_TYPES, RISKS, BANDS, DIMS, LISTS, QSCHEMA, SETTINGS_DEFAULT, THRESHOLD_LABELS, MATRIX_DEFAULT, EXAMPLE, blankScores, scoresFrom, num, compute };
});
