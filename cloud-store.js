'use strict';
// Tamaraw Time's app data is stored on Supabase, NOT in browser localStorage.
// Supabase Auth may retain an authentication session on the device so users
// do not have to sign in on every page load. No planner data is cached here.
const CloudStore = (() => {
  const cfg = window.TAMARAW_CLOUD || {};
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || '')
    && typeof cfg.supabasePublishableKey === 'string'
    && cfg.supabasePublishableKey.length > 15
    && !cfg.supabasePublishableKey.includes('YOUR_')
    && !cfg.supabasePublishableKey.startsWith('sb_secret_')
    && typeof window.supabase?.createClient === 'function';
  const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey) : null;
  let user = null;
  function getUser() { return user; }
  function setUser(next) { user = next; }
  function requireUser() { if (!user || !db) throw new Error('Please sign in to save your data online.'); return user.id; }
  function check(result) { if (result.error) throw result.error; return result.data; }
  const manilaDate = iso => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date(iso));
    const p = Object.fromEntries(parts.map(item => [item.type, item.value]));
    return `${p.year}-${p.month}-${p.day}`;
  };
  function eventFromRow(row) { return { type: row.event_type, at: row.occurred_at, day: manilaDate(row.occurred_at) }; }
  async function load() {
    const uid = requireUser();
    const [p, e, f] = await Promise.all([
      db.from('app_states').select('payload').eq('user_id', uid).maybeSingle(),
      db.from('activity_events').select('event_type,occurred_at').eq('user_id', uid).order('occurred_at', { ascending: true }).limit(5000),
      db.from('feedback').select('respondent_code,overall,ease,feature,comments,updated_at').eq('user_id', uid).maybeSingle()
    ]);
    check(p); check(e); check(f);
    return {
      payload: p.data?.payload || null,
      events: (e.data || []).map(eventFromRow),
      feedback: f.data ? {
        code: f.data.respondent_code || '', overall: f.data.overall, ease: f.data.ease,
        feature: f.data.feature, comments: f.data.comments,
        savedAt: f.data.updated_at
      } : null
    };
  }
  async function savePayload(payload) {
    const uid = requireUser();
    check(await db.from('app_states').upsert({user_id: uid, payload}, {onConflict: 'user_id'}));
  }
  async function logEvent(type) {
    const uid = requireUser();
    const data = check(await db.from('activity_events')
      .insert({user_id: uid, event_type: type})
      .select('event_type,occurred_at').single());
    return eventFromRow(data);
  }
  async function saveFeedback(f) {
    const uid = requireUser();
    const data = check(await db.from('feedback').upsert({
      user_id: uid, respondent_code: f.code, overall: Number(f.overall),
      ease: Number(f.ease), feature: f.feature, comments: f.comments
    }, {onConflict: 'user_id'}).select('respondent_code,overall,ease,feature,comments,updated_at').single());
    return {
      code: data.respondent_code || '', overall: data.overall, ease: data.ease,
      feature: data.feature, comments: data.comments, savedAt: data.updated_at
    };
  }
  return { configured, db, getUser, setUser, load, savePayload, logEvent, saveFeedback, manilaDate };
})();
