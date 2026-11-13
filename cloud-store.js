'use strict';
// Supabase cloud storage and sign-in. Planner records never go into localStorage.
// Supabase Auth manages its own login session storage.
const CloudStore = (() => {
  const cfg = window.TAMARAW_CLOUD || {};
  let remember = true;
  try { remember = localStorage.getItem('tamaraw_remember_me') !== 'false'; } catch (_) {}
  const authStorage = {
    getItem(key){try{return remember?localStorage.getItem(key):sessionStorage.getItem(key);}catch(_){return null;}},
    setItem(key,value){try{const target=remember?localStorage:sessionStorage,other=remember?sessionStorage:localStorage;target.setItem(key,value);other.removeItem(key);}catch(error){throw error;}},
    removeItem(key){try{localStorage.removeItem(key);sessionStorage.removeItem(key);}catch(_){}}
  };
  const configured = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cfg.supabaseUrl || '')
    && typeof cfg.supabasePublishableKey === 'string'
    && cfg.supabasePublishableKey.length > 15
    && !cfg.supabasePublishableKey.includes('YOUR_')
    && !cfg.supabasePublishableKey.startsWith('sb_secret_')
    && typeof window.supabase?.createClient === 'function';
  const db = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey,{auth:{storage:authStorage,persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}) : null;
  let user = null;
  function getUser(){return user;}
  function setUser(u){user=u;}
  function getRemember(){return remember;}
  function setRemember(value){remember=!!value;localStorage.setItem('tamaraw_remember_me',String(remember));for(const key of Object.keys(remember?sessionStorage:localStorage)){if(!key.startsWith('sb-')||!key.endsWith('-auth-token'))continue;if(remember){localStorage.setItem(key,sessionStorage.getItem(key));sessionStorage.removeItem(key);}else localStorage.removeItem(key);}}
  function requireUser(){if(!user || !db)throw new Error('Sign in before saving online.');return user.id;}
  function check(r){if(r.error)throw r.error;return r.data;}
  async function load(){
    const id=requireUser();
    const p=await db.from('app_states').select('payload').eq('user_id',id).maybeSingle();
    check(p);
    return {payload:p.data?.payload||null};
  }
  async function savePayload(payload){
    const id=requireUser();
    check(await db.from('app_states').upsert({user_id:id,payload},{onConflict:'user_id'}));
  }
  async function logEvent(eventType){
    const id=requireUser();
    // Timestamps come from the database, not the student's device.
    check(await db.from('activity_events').insert({user_id:id,event_type:eventType}));
  }
  return {configured,db,getUser,setUser,getRemember,setRemember,load,savePayload,logEvent};
})();
