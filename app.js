'use strict';
/* Tamaraw Time v5 — focused attendance/commute planner.
   Student data is stored in Supabase. No planner data is written to localStorage.
   GPS is kept only in memory and is never uploaded to Tamaraw Time's database. */
const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const campusOptions = {
 'FEU Tech':'FEU Institute of Technology, P. Paredes Street, Manila, Philippines',
 'FEU Manila':'Far Eastern University, Nicanor Reyes Street, Manila, Philippines',
 'FEU Diliman':'Far Eastern University Diliman, Quezon City, Philippines',
 'FEU Alabang':'Far Eastern University Alabang, Muntinlupa, Philippines'
};
const defaults = {classes:[],settings:{name:'Tamaraw',campus:'FEU Tech',travel:55,prep:45,buffer:15,mode:'Transit'},onboarding:{finished:false}};
let state = structuredClone(defaults), currentPage='home', loadedUser=null, authCounter=0;
let writeQueue = Promise.resolve(), tutorialIndex=0, gpsPosition=null;
let mapOriginText='', legacyPayload={};
const uid = () => globalThis.crypto?.randomUUID?.() ?? `tt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmtDate = date => date.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
const ampm = time => {const [h,m]=String(time).split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;};
const timeMinutes = time => {const [h,m]=String(time).split(':').map(Number);return h*60+m;};
const minsToTime = val => {const n=(val%1440+1440)%1440;return ampm(`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`);};
const formatClock = () => {
 const now=new Date();
 $('#today').textContent=now.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'});
 $('#clock').textContent=now.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,timeZone:'Asia/Manila'});
};
function nextClassDate(c){
 const now=new Date(), wd=Number(c.day), delta=(wd-now.getDay()+7)%7;
 const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+delta);
 const [h,m]=c.time.split(':').map(Number);d.setHours(h,m,0,0);
 if(d<=now)d.setDate(d.getDate()+7);
 return d;
}
const upcoming = () => state.classes.map(c=>({...c,when:nextClassDate(c)})).sort((a,b)=>a.when-b.when);
const departure = (c,travel=state.settings.travel,buffer=state.settings.buffer,prep=state.settings.prep) => {
 const start=timeMinutes(c.time);return {leave:minsToTime(start-travel-buffer),wake:minsToTime(start-travel-buffer-prep),arrive:minsToTime(start-buffer)};
};
function toast(text){const el=$('#toast');el.textContent=text;el.style.display='block';clearTimeout(window.__ttToast);window.__ttToast=setTimeout(()=>el.style.display='none',3500);}
function snapshot(){return {...structuredClone(legacyPayload),classes:structuredClone(state.classes),settings:structuredClone(state.settings),onboarding:structuredClone(state.onboarding)};}
function saveToCloud(eventType){
 const data=snapshot();
 const job=writeQueue.catch(()=>{}).then(async()=>{
  await CloudStore.savePayload(data);
  if(eventType)await CloudStore.logEvent(eventType);
 });
 writeQueue=job;job.catch(err=>toast('Could not save online: '+(err.message||err)));
 return job;
}
async function logActivity(type){
 try{await writeQueue.catch(()=>{});await CloudStore.logEvent(type);}catch(err){toast('Activity log failed: '+(err.message||err));}
}
const tutorialSteps=[
 {icon:'🐃',title:'Welcome to Tamaraw Time',body:'This website helps you prepare for class and arrive at the right time.',tip:'Sign in so your schedule and commute settings are saved to your account.'},
 {icon:'▦',title:'1. Set your class schedule',body:'Add the subject, day, starting time, classroom and FEU campus.',tip:'Your dashboard will highlight the next scheduled class.'},
 {icon:'⏰',title:'2. Plan your departure',body:'Choose a class and adjust the travel time, preparation time and arrival buffer to find your suggested leaving time.',tip:'Travel minutes are an estimate that you can change based on traffic.'},
 {icon:'🗺️',title:'3. Check your route',body:'Open the Commute Planner and choose Open in Google Maps to view directions in a new tab. You can use GPS or enter your starting point.',tip:'Location permission is optional. GPS coordinates are not saved in our database.'}
];
function drawTutorial(){
 const step=tutorialSteps[tutorialIndex];
 $('#tutorial-step').innerHTML=`<div class="tutorial-illustration">${step.icon}</div><h2 id="tutorial-title">${esc(step.title)}</h2><p>${esc(step.body)}</p><div class="tutorial-tip">${esc(step.tip)}</div>`;
 $('#tutorial-dots').innerHTML=tutorialSteps.map((_,i)=>`<span class="${i===tutorialIndex?'active':''}"></span>`).join('');
 $('#tutorial-count').textContent=`${tutorialIndex+1} / ${tutorialSteps.length}`;
 $('#tutorial-prev').disabled=tutorialIndex===0;
 $('#tutorial-next').textContent=tutorialIndex===tutorialSteps.length-1?'Get started ✓':'Next →';
}
function showTutorial(){tutorialIndex=0;drawTutorial();if(!$('#tutorial-dialog').open)$('#tutorial-dialog').showModal();}
function finishTutorial(){state.onboarding.finished=true;$('#tutorial-dialog').close();saveToCloud();}
const badge = label=>`<span class="badge">${esc(label)}</span>`;
const classCard = c => `<div class="item"><div><b>${esc(c.name)}</b><small>${esc(days[Number(c.day)])} · ${ampm(c.time)}–${ampm(c.end)} · ${esc(c.room||'Room not set')}</small><small>${esc(c.campus||state.settings.campus)}</small></div><div class="actions-inline"><button class="iconbutton" type="button" data-action="del-class" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">×</button></div></div>`;
function navigate(next){
 currentPage=next;
 document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===next));
 const title={home:['Good day, '+state.settings.name+'! 👋','Focus on arriving to class on time.'],schedule:['Class Schedule','Your weekly class timetable.'],commute:['Commute Planner','Know when to get ready and when to leave.'],settings:['Settings','Adjust your punctuality preferences.']}[next];
 $('#page-title').textContent=title[0];$('#page-subtitle').textContent=title[1];
 $('#quick-add').hidden=next==='settings';
 render();
}
function render(){
 let html='';const next=upcoming()[0],recommendation=next?departure(next):null;
 if(currentPage==='home'){
  html=`<div class="grid three"><div class="card stat accent"><div class="label">NEXT CLASS</div><div class="value" style="font-size:25px">${next?esc(next.name):'No classes yet'}</div><div class="note">${next?`${esc(days[Number(next.day)])} · ${ampm(next.time)}`:'Add your first class to begin'}</div></div><div class="card stat"><div class="label">SUGGESTED LEAVE TIME</div><div class="value">${recommendation?recommendation.leave:'—'}</div><div class="note">${next?'Based on your commute settings':'Once a class is scheduled'}</div></div><div class="card stat"><div class="label">TRAVEL ESTIMATE</div><div class="value">${esc(state.settings.travel)} <span style="font-size:17px">min</span></div><div class="note">${esc(state.settings.mode)} · editable</div></div></div>
  <div class="section-head"><h2>Plan for punctuality</h2></div><div class="hero"><div><small>${next?'UPCOMING CLASS · '+esc(days[Number(next.day)]):'YOUR PUNCTUALITY ASSISTANT'}</small><h2>${recommendation?'Leave by '+recommendation.leave:'Add your schedule to start'}</h2><small>${recommendation?'Prepare by '+recommendation.wake+' · Aim to arrive '+recommendation.arrive:'Get a personalized departure recommendation'}</small></div><button class="primary" data-action="go-commute">Plan my commute →</button></div>
  <div class="card" style="margin-top:21px"><div class="section-head" style="margin:0 0 8px"><h2>Upcoming classes</h2><button class="linkbtn" data-action="go-schedule">View schedule →</button></div>${upcoming().slice(0,4).map(classCard).join('')||'<div class="empty">Your class list is empty. Add a class to get started.</div>'}</div>`;
 }else if(currentPage==='schedule'){
  html=`<div class="section-head"><h2>Weekly class schedule</h2><button class="primary" data-action="add-class">+ Add class</button></div><div class="card">${state.classes.length?[...state.classes].sort((a,b)=>Number(a.day)-Number(b.day)||a.time.localeCompare(b.time)).map(classCard).join(''):'<div class="empty">No classes saved yet.</div>'}</div><div class="alert" style="margin-top:18px">Add your real class times. This app does not automatically import FEU attendance records.</div>`;
 }else if(currentPage==='commute'){
  const opts=upcoming().map(c=>`<option value="${esc(c.id)}">${esc(c.name)} — ${esc(days[Number(c.day)])} ${ampm(c.time)}</option>`).join('');
  html=`<div class="grid two"><div class="card"><h2>Plan your next trip</h2><div class="field"><label for="class-select">Choose a class</label><select id="class-select">${opts||'<option value="">Add a class first</option>'}</select></div><div class="field"><label for="trip-mode">Travel mode</label><select id="trip-mode">${['Transit','Driving','Walking'].map(m=>`<option ${state.settings.mode===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label for="trip-travel">Estimated journey (minutes)</label><input id="trip-travel" type="number" min="1" max="480" value="${state.settings.travel}"></div><div class="formgrid"><div class="field"><label for="trip-prep">Preparation minutes</label><input id="trip-prep" type="number" min="0" max="240" value="${state.settings.prep}"></div><div class="field"><label for="trip-buffer">Arrival buffer minutes</label><input id="trip-buffer" type="number" min="0" max="120" value="${state.settings.buffer}"></div></div><button class="primary" data-action="save-commute">Save commute settings</button><div style="margin-top:22px"><h2>Your recommended routine</h2><div id="commute-output"></div></div></div>
  <div class="card map-card"><div class="section-head" style="margin:0 0 8px"><h2>Directions to campus</h2>${badge('Google Maps')}</div><p class="mini muted">Enter your starting point or use your GPS, then open directions in Google Maps. No Google Maps API key is needed.</p><div class="field"><label for="trip-origin">Starting point (optional)</label><input id="trip-origin" type="text" maxlength="180" placeholder="e.g. Cubao, Quezon City" value="${esc(mapOriginText)}"></div><div class="map-buttons"><button class="secondary" type="button" data-action="location">◎ Use my GPS</button><a class="primary directions-button" id="directions-link" target="_blank" rel="noopener noreferrer">Open in Google Maps ↗</a></div><p class="mini muted" id="gps-output" role="status">${gpsPosition?'GPS location available for this session.':'Location is optional. GPS works on HTTPS with permission.'}</p><div class="directions-panel"><div class="directions-panel-icon">🗺️</div><h3 id="directions-campus">FEU campus</h3><p class="mini muted">Google Maps opens separately with the destination and travel mode you select. Return here to adjust your suggested departure time.</p></div><p class="mini muted" style="margin-top:14px">Google may receive your origin when you open the link. Tamaraw Time does not save GPS coordinates. Travel minutes in this planner are estimates, not live Google Maps ETA.</p></div></div>`;
 }else if(currentPage==='settings'){
  html=`<div class="grid two"><div class="card"><h2>Student preferences</h2><form id="settings-form"><div class="field"><label>Name</label><input name="name" maxlength="40" required value="${esc(state.settings.name)}"></div><div class="field"><label>Preferred FEU campus</label><select name="campus">${Object.keys(campusOptions).map(c=>`<option ${state.settings.campus===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="field"><label>Travel mode</label><select name="mode">${['Transit','Driving','Walking'].map(m=>`<option ${state.settings.mode===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label>Default travel time (min)</label><input name="travel" type="number" min="1" max="480" required value="${state.settings.travel}"></div><div class="field"><label>Get-ready time (min)</label><input name="prep" type="number" min="0" max="240" required value="${state.settings.prep}"></div><div class="field"><label>Arrival buffer (min)</label><input name="buffer" type="number" min="0" max="120" required value="${state.settings.buffer}"></div><button class="primary" type="submit">Save settings</button></form></div><div class="stack"><div class="card"><h2>Your account</h2><p class="muted">Your class schedule and commute preferences are saved in your Tamaraw Time account in Supabase. Study activity is recorded privately for the research team, not shown as a student progress score.</p><button type="button" class="secondary" data-action="refresh-cloud">Refresh cloud data</button><button type="button" class="secondary" data-action="export">Export your schedule (JSON)</button><button type="button" class="danger" data-action="reset">Clear schedule and preferences</button><div class="settings-help"><h3>First-time guide</h3><p class="mini muted">Replay the short punctuality and commute tutorial.</p><button type="button" class="secondary" data-action="tutorial">Replay tutorial</button></div></div></div></div>`;
 }
 $('#content').innerHTML=html;
 if(currentPage==='commute'){
  updateCommute();
  $('#class-select').addEventListener('change',()=>{updateCommute();updateDirectionsLink();});
  for(const id of ['trip-travel','trip-buffer','trip-prep'])$('#'+id).addEventListener('input',updateCommute);
  $('#trip-mode').addEventListener('change',updateDirectionsLink);
  $('#trip-origin').addEventListener('input',e=>{mapOriginText=e.target.value;updateDirectionsLink();});
  $('#directions-link').addEventListener('click',()=>{void logActivity('maps_opened');});
  updateDirectionsLink();
 }
}
function selectedClass(){return state.classes.find(c=>c.id===$('#class-select')?.value)||upcoming()[0]||null;}
function updateCommute(){
 const target=$('#commute-output');if(!target)return;
 const c=selectedClass();if(!c){target.innerHTML='<div class="empty">Add a class to calculate departure times.</div>';return;}
 const value=id=>Math.max(0,Number($('#'+id)?.value)||0);
 const travel=value('trip-travel'),buffer=value('trip-buffer'),prep=value('trip-prep');
 const result=departure(c,travel,buffer,prep);
 target.innerHTML=`<div class="highlight"><strong>${esc(c.name)}</strong><div class="mini">${esc(days[Number(c.day)])} · Starts ${ampm(c.time)} · ${esc(c.campus||state.settings.campus)}</div></div><div class="results"><div class="result"><span>Get ready</span><b>${result.wake}</b></div><div class="result"><span>Leave by</span><b>${result.leave}</b></div><div class="result"><span>Be there by</span><b>${result.arrive}</b></div></div><p class="mini muted">Suggested times use your entered ${travel}-minute journey, ${prep}-minute preparation time, and ${buffer}-minute arrival buffer. They are planning estimates, not live traffic predictions.</p>`;
}
function googleDestination(){const c=selectedClass();return campusOptions[c?.campus]||campusOptions[state.settings.campus]||campusOptions['FEU Tech'];}
function routeMode(){return {Transit:'transit',Driving:'driving',Walking:'walking'}[$('#trip-mode')?.value||state.settings.mode]||'transit';}
function googleDirectionsUrl(){
 const query=new URLSearchParams({api:'1',destination:googleDestination(),travelmode:routeMode()});
 const origin=mapOriginText.trim()||(gpsPosition?`${gpsPosition.lat},${gpsPosition.lng}`:'');
 if(origin)query.set('origin',origin);
 return `https://www.google.com/maps/dir/?${query.toString()}`;
}
function updateDirectionsLink(){
 const link=$('#directions-link');if(!link)return;
 link.href=googleDirectionsUrl();
 const label=$('#directions-campus');if(label)label.textContent=selectedClass()?.campus||state.settings.campus;
}
const classForm=`<div class="field"><label>Subject name *</label><input name="name" maxlength="80" required placeholder="e.g. Data Structures"></div><div class="formgrid"><div class="field"><label>Day of week</label><select name="day">${days.map((day,i)=>`<option value="${i}">${day}</option>`).join('')}</select></div><div class="field"><label>Room</label><input name="room" maxlength="40" placeholder="Room 401"></div><div class="field"><label>Start time *</label><input name="time" type="time" required value="09:00"></div><div class="field"><label>End time *</label><input name="end" type="time" required value="10:30"></div></div><div class="field"><label>Campus</label><select name="campus">${Object.keys(campusOptions).map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>`;
function openClassModal(){
 $('#modal-title').textContent='Add class';$('#modal-fields').innerHTML=classForm;
 $('#modal-fields [name="campus"]').value=state.settings.campus;
 $('#dialog').showModal();
}
$('#modal-form').addEventListener('submit',async event=>{
 event.preventDefault();const fields=Object.fromEntries(new FormData(event.target).entries());
 if(fields.end<=fields.time){toast('Class end time must be after the start time.');return;}
 state.classes.push({...fields,id:uid(),day:Number(fields.day)});
 $('#dialog').close();render();
 try{await saveToCloud('class_added');toast('Class saved online ✓');}catch(err){toast('Cloud save failed: '+(err.message||err));}
});
$('#close-modal').onclick=$('#cancel-modal').onclick=()=>$('#dialog').close();
$('#quick-add').onclick=openClassModal;
document.querySelectorAll('#nav button').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
$('#content').addEventListener('submit',async event=>{
 if(event.target.id!=='settings-form')return;
 event.preventDefault();const v=Object.fromEntries(new FormData(event.target).entries());
 const settings={...state.settings,name:v.name.trim()||'Tamaraw',campus:v.campus,mode:v.mode,travel:Number(v.travel),prep:Number(v.prep),buffer:Number(v.buffer)};
 if(!Number.isFinite(settings.travel)||settings.travel<1||settings.travel>480||settings.prep<0||settings.prep>240||settings.buffer<0||settings.buffer>120){toast('Please enter valid settings.');return;}
 const changed=Object.keys(settings).some(k=>settings[k]!==state.settings[k]);state.settings=settings;navigate('settings');
 if(!changed){toast('No settings changed');return;}
 try{await saveToCloud('settings_saved');toast('Settings saved online ✓');}catch(err){toast('Save failed: '+(err.message||err));}
});
$('#content').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='add-class'){openClassModal();return;}
 if(action==='go-commute'){navigate('commute');return;}
 if(action==='go-schedule'){navigate('schedule');return;}
 if(action==='tutorial'){showTutorial();return;}
 if(action==='del-class'){
  if(!confirm('Remove this class?'))return;
  state.classes=state.classes.filter(c=>c.id!==button.dataset.id);render();
  try{await saveToCloud('class_deleted');toast('Class removed online ✓');}catch(err){toast('Remove failed: '+(err.message||err));}return;
 }
 if(action==='save-commute'){
  const val=id=>Number($('#'+id)?.value);
  const revised={travel:val('trip-travel'),buffer:val('trip-buffer'),prep:val('trip-prep'),mode:$('#trip-mode').value};
  if(!Number.isFinite(revised.travel)||revised.travel<1||revised.travel>480||!Number.isFinite(revised.buffer)||revised.buffer<0||revised.buffer>120||!Number.isFinite(revised.prep)||revised.prep<0||revised.prep>240){toast('Please enter valid travel times.');return;}
  const changed=Object.entries(revised).some(([k,v])=>v!==state.settings[k]);
  Object.assign(state.settings,revised);updateCommute();
  if(!changed){toast('No commute settings changed');return;}
  try{await saveToCloud('commute_saved');toast('Commute saved online ✓');}catch(err){toast('Save failed: '+(err.message||err));}return;
 }
 if(action==='location'){
  const output=$('#gps-output');if(!navigator.geolocation){output.textContent='GPS is not available in your browser.';return;}
  output.textContent='Requesting location access…';
  navigator.geolocation.getCurrentPosition(async position=>{
   gpsPosition={lat:Number(position.coords.latitude.toFixed(6)),lng:Number(position.coords.longitude.toFixed(6))};
   output.textContent='GPS location acquired. Click “Open in Google Maps” to view your route.';updateDirectionsLink();
   await logActivity('gps_checked');
  },error=>{output.textContent=`Location unavailable: ${error.message}. You may type a starting address instead.`;},{enableHighAccuracy:true,maximumAge:30000,timeout:12000});return;
 }
 if(action==='refresh-cloud'){
  try{await refreshCloud();toast('Cloud data refreshed ✓');}catch(err){toast('Refresh failed: '+(err.message||err));}return;
 }
 if(action==='export'){
  const blob=new Blob([JSON.stringify({classes:state.classes,settings:state.settings,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='tamaraw-time-schedule.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);return;
 }
 if(action==='reset'){
  if(!confirm('Clear your saved classes and commute preferences? Study activity logs remain stored for the research team.'))return;
  const old=snapshot();state.classes=[];state.settings=structuredClone(defaults.settings);
  try{await saveToCloud();navigate('settings');toast('Schedule reset online ✓');}
  catch(err){state.classes=old.classes;state.settings=old.settings;render();toast('Reset failed: '+(err.message||err));}
 }
});
$('#tutorial-next').addEventListener('click',()=>{if(tutorialIndex===tutorialSteps.length-1){finishTutorial();navigate('schedule');}else{tutorialIndex++;drawTutorial();}});
$('#tutorial-prev').addEventListener('click',()=>{if(tutorialIndex>0){tutorialIndex--;drawTutorial();}});
$('#tutorial-close').addEventListener('click',finishTutorial);
$('#tutorial-skip').addEventListener('click',finishTutorial);
$('#tutorial-dialog').addEventListener('cancel',()=>{state.onboarding.finished=true;saveToCloud();});
function authMode(mode){
 const signup=mode==='signup';$('#auth-form').dataset.mode=mode;
 $('#auth-submit').textContent=signup?'Create account':'Sign in';
 $('#auth-heading').textContent=signup?'Create your Tamaraw Time account':'Welcome back, Tamaraw!';
 $('#auth-mode-toggle').textContent=signup?'Already have an account? Sign in':'New here? Create an account';
 $('#auth-consent').hidden=!signup;$('#study-consent').required=signup;
 $('#auth-password').autocomplete=signup?'new-password':'current-password';$('#auth-message').textContent='';
}
function showAuth(message=''){
 loadedUser=null;CloudStore.setUser(null);$('#app-layout').hidden=true;$('#auth-screen').hidden=false;$('#account-email').textContent='';
 if($('#tutorial-dialog').open)$('#tutorial-dialog').close();
 $('#auth-message').textContent=message;
 if(!CloudStore.configured){$('#auth-submit').disabled=true;$('#auth-message').textContent='Online database not connected. Ask the project owner to configure cloud-config.js and install schema.sql in Supabase.';}
}
async function enterApp(user){
 if(!user||!CloudStore.configured||loadedUser===user.id)return;
 const ticket=++authCounter;CloudStore.setUser(user);$('#auth-message').textContent='Loading your saved schedule…';
 try{
  const data=await CloudStore.load();if(ticket!==authCounter)return;
  const p=data.payload||{};
  legacyPayload=structuredClone(p);state={classes:Array.isArray(p.classes)?p.classes:[],settings:{...defaults.settings,...(p.settings||{})},onboarding:{finished:!!p?.onboarding?.finished}};
  loadedUser=user.id;gpsPosition=null;mapOriginText='';
  $('#account-email').textContent=user.email||'Student account';$('#auth-screen').hidden=true;$('#app-layout').hidden=false;
  navigate('home');if(!state.onboarding.finished)setTimeout(showTutorial,120);
 }catch(err){showAuth('Could not load cloud data: '+(err.message||err)+'. Check your Supabase setup.');}
}
async function refreshCloud(){
 if(!CloudStore.getUser())return;
 await writeQueue.catch(()=>{});const data=await CloudStore.load();const p=data.payload||{};
 legacyPayload=structuredClone(p);state={classes:Array.isArray(p.classes)?p.classes:[],settings:{...defaults.settings,...(p.settings||{})},onboarding:{finished:!!p?.onboarding?.finished}};
 navigate(currentPage);
}
$('#auth-mode-toggle').addEventListener('click',()=>authMode($('#auth-form').dataset.mode==='signup'?'login':'signup'));
$('#auth-form').addEventListener('submit',async event=>{
 event.preventDefault();if(!CloudStore.configured)return;
 const button=$('#auth-submit'),signup=event.target.dataset.mode==='signup';
 const email=$('#auth-email').value.trim(),password=$('#auth-password').value;
 if(signup&&!$('#study-consent').checked){$('#auth-message').textContent='Please read the research activity notice.';return;}
 button.disabled=true;$('#auth-message').textContent=signup?'Creating your account…':'Signing in…';
 try{
  const res=signup?await CloudStore.db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):await CloudStore.db.auth.signInWithPassword({email,password});
  if(res.error)throw res.error;
  if(signup&&!res.data.session)$('#auth-message').textContent='Account created. Please verify your email, then sign in.';
  else if(res.data.user)await enterApp(res.data.user);
 }catch(err){$('#auth-message').textContent=err.message||'Could not sign in.';}finally{button.disabled=false;}
});
$('#signout-button').addEventListener('click',async()=>{
 await writeQueue.catch(()=>{});const {error}=await CloudStore.db.auth.signOut();
 if(error){toast('Sign out failed: '+error.message);return;}
 ++authCounter;showAuth('You are signed out. Your classes are saved online.');
});
async function boot(){
 formatClock();setInterval(formatClock,1000);authMode('login');
 if(!CloudStore.configured){showAuth();return;}
 CloudStore.db.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'){++authCounter;showAuth('Signed out.');}
  else if(event==='SIGNED_IN'&&session?.user)setTimeout(()=>enterApp(session.user),0);
 });
 const {data,error}=await CloudStore.db.auth.getSession();
 if(error){showAuth(error.message);return;}
 if(data.session?.user)await enterApp(data.session.user);else showAuth();
}
boot();
