'use strict';
/* Tamaraw Time v4 — focused attendance/commute planner.
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
const defaults = {classes:[],tasks:[],settings:{name:'Tamaraw',campus:'FEU Tech',travel:55,campusTravel:{},prep:45,buffer:15,mode:'Transit',theme:'forest'},onboarding:{finished:false}};
let state = structuredClone(defaults), currentPage='home', loadedUser=null, authCounter=0,localMode=false;
let writeQueue = Promise.resolve(), tutorialIndex=0, gpsPosition=null,editingClassId=null;
let recoveryPending=false;
let alarmNotificationsEnabled=(()=>{try{return localStorage.getItem('tamaraw_alarm_notifications')==='true';}catch(_){return false;}})();
let lastDepartureNotification='',pendingDepartureNotification='',serviceWorkerReady=null,deferredInstallPrompt=null;
let scheduleMonth=null,scheduleSelectedKey='';
let mapOriginText='', shownMapSignature='';
let liveMap=null, liveMarker=null, campusMarker=null, liveRoute=null, liveMapResizeObserver=null, gpsWatchId=null, routeSeq=0, lastRouteAt=0;
let activeRouteEstimate=null, routeRequestBusy=false, routeAbortController=null, lastRouteOrigin=null, autoRouteTimer=null;
let jeepneyOptions=[], jeepneyMarkers=[], jeepneyWalkLayers=[], jeepneySelectionSerial=0, jeepneyRequestSerial=0, jeepneyRequestBusy=false;
let railOptions=[],railLayers=[];
let historicalCatalogPromise=null,historicalQuery='';
let customOrigin=null,originMarker=null,originPickerActive=false,originMode='gps',coordinateOriginText='';
const themeNames={forest:'FEU Forest',ocean:'Coastal Blue',sunset:'Golden Hour',night:'Midnight'};
function currentTravel(c,mode=state.settings.mode){
 const campus=c?.campus||state.settings.campus;
 if(activeRouteEstimate && activeRouteEstimate.campus===campus && activeRouteEstimate.mode===mode && Date.now()-activeRouteEstimate.at<5*60*1000)return activeRouteEstimate.minutes;
 if(Number.isFinite(Number(c?.travel))&&Number(c.travel)>0)return Math.max(1,Number(c.travel));
 const campusDefault=Number(state.settings.campusTravel?.[campus]);if(Number.isFinite(campusDefault)&&campusDefault>0)return Math.max(1,campusDefault);
 return Math.max(1,Number(state.settings.travel)||55);
}
function applyTheme(name){document.documentElement.dataset.theme=themeNames[name]?name:'forest';}
function effectiveMode(c){return activeRouteEstimate && activeRouteEstimate.campus===(c?.campus||state.settings.campus)&&Date.now()-activeRouteEstimate.at<5*60*1000?activeRouteEstimate.mode:state.settings.mode;}
function currentDeparture(c,travel=currentTravel(c,effectiveMode(c)),buffer=state.settings.buffer,prep=state.settings.prep){return departure(c,travel,buffer,prep);}
function departureNotificationEligible(departureAt,now=Date.now()){return now>=departureAt&&now-departureAt<=5*60*1000;}
function distanceMeters(a,b){const r=Math.PI/180,dl=(b.lng-a.lng)*r,dp=(b.lat-a.lat)*r,phi1=a.lat*r,phi2=b.lat*r,x=Math.sin(dp/2)**2+Math.cos(phi1)*Math.cos(phi2)*Math.sin(dl/2)**2;return 12742000*Math.asin(Math.sqrt(x));}
const campusCoords={'FEU Tech':[14.6043,120.9884],'FEU Manila':[14.6046,120.9867],'FEU Diliman':[14.6994,121.0648],'FEU Alabang':[14.4195,121.0438]};
const uid = () => globalThis.crypto?.randomUUID?.() ?? `tt-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const fmtDate = date => date.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
const ampm = time => {const [h,m]=String(time).split(':').map(Number);return `${h%12||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`;};
const timeMinutes = time => {const [h,m]=String(time).split(':').map(Number);return h*60+m;};
const minsToTime = val => {const n=(val%1440+1440)%1440;return ampm(`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`);};
const classWeekdays = c => [...new Set((Array.isArray(c.weekdays)&&c.weekdays.length?c.weekdays:[c.day]).map(Number).filter(d=>d>=0&&d<=6))].sort((a,b)=>a-b);
const manilaDateParts = (date=new Date()) => {const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);return Object.fromEntries(parts.filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));};
const dateKey = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
const dateLabel = d => new Intl.DateTimeFormat('en-PH',{dateStyle:'long',timeZone:'UTC'}).format(d);
const formatClock = () => {
 const now=new Date();
 $('#today').textContent=now.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric',year:'numeric',timeZone:'Asia/Manila'});
 $('#clock').textContent=now.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',second:'2-digit',hour12:true,timeZone:'Asia/Manila'});
 refreshDepartureCountdown();
};
function nextClassDate(c){
 const now=Date.now(),parts=manilaDateParts(),today=new Date(Date.UTC(parts.year,parts.month-1,parts.day));
 let best=null;
 for(const wd of classWeekdays(c)){const delta=(wd-today.getUTCDay()+7)%7,d=new Date(today);d.setUTCDate(d.getUTCDate()+delta);const [h,m]=c.time.split(':').map(Number);const at=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate(),h-8,m);const timestamp=at<=now?at+7*86400000:at;if(best===null||timestamp<best)best=timestamp;}
 return new Date(best??now);
}
const upcoming = () => state.classes.flatMap(c=>classWeekdays(c).map(day=>({...c,day,when:nextClassDate({...c,day,weekdays:[day]})}))).sort((a,b)=>a.when-b.when);
function isStandaloneApp(){return !!(window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true);}
function isAppleMobile(){return /iPhone|iPad|iPod/.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1);}
function deviceSetupCard(){
 const installed=isStandaloneApp(),supported=typeof window.Notification!=='undefined'&&'serviceWorker'in navigator&&window.isSecureContext,permission=supported?Notification.permission:'unsupported';
 let notificationText,notificationButton;
 if(permission==='unsupported'){notificationText='This browser needs HTTPS and notification support for leave alerts.';notificationButton='<button class="secondary" type="button" disabled>Notifications unavailable</button>';}
 else if(permission==='denied'){notificationText='Notifications are blocked for this site. Allow them in your browser or device settings, then return here.';notificationButton='<button class="secondary" type="button" data-action="notification-help">Notification settings help</button>';}
 else if(alarmNotificationsEnabled&&permission==='granted'){notificationText='Leave-time alerts are on for this device. Keep Tamaraw Time open for the alarm to run.';notificationButton='<button class="secondary" type="button" data-action="disable-alarm-notifications">Turn alerts off</button>';}
 else{notificationText=isAppleMobile()&&!installed?'On iPhone and iPad, add this web app to your Home Screen first, then open it there to enable notifications.':'Get a browser pop-up when your recommended departure time arrives. Keep Tamaraw Time open for the alarm to run.';notificationButton='<button class="primary" type="button" data-action="enable-alarm-notifications">Turn on alarm notifications</button>';}
 const installButton=installed?'':`<button class="secondary" type="button" data-action="show-install-guide">Add to Home Screen</button>`;
 return `<section class="card device-setup-card"><div><h2>Device reminders</h2><p class="mini muted">${esc(notificationText)}</p></div><div class="device-setup-actions">${notificationButton}${installButton}</div></section>`;
}
function ensureServiceWorker(){
 if(!('serviceWorker'in navigator)||!window.isSecureContext)return Promise.resolve(null);
 serviceWorkerReady??=navigator.serviceWorker.register('./service-worker.js').then(()=>navigator.serviceWorker.ready).catch(error=>{console.warn('Notifications need a service worker:',error);return null;});
 return serviceWorkerReady;
}
function showInstallGuide(){
 let dialog=$('#install-guide-dialog');
 if(!dialog){dialog=document.createElement('dialog');dialog.id='install-guide-dialog';dialog.setAttribute('aria-labelledby','install-guide-title');document.body.append(dialog);}
 const apple=isAppleMobile();
 dialog.innerHTML=`<div class="modal-head"><h2 id="install-guide-title">Add Tamaraw Time to your Home Screen</h2><button type="button" class="iconbutton" data-close-install-guide aria-label="Close">×</button></div><p class="mini muted">Install the web app for quick access. The steps below work on iPhone/iPad and Android.</p><div class="install-guide-grid"><section><h3>iPhone or iPad</h3><ol><li>Open Tamaraw Time in <b>Safari</b>.</li><li>Tap the <b>Share</b> button (square with an upward arrow).</li><li>Scroll and tap <b>Add to Home Screen</b>.</li><li>Tap <b>Add</b>, then launch Tamaraw Time from the new icon.</li></ol><p class="mini muted">To enable alarm notifications, use the installed Home Screen app on iOS/iPadOS 16.4 or later, then tap “Turn on alarm notifications.”</p></section><section><h3>Android</h3><ol><li>Open Tamaraw Time in <b>Chrome</b>.</li><li>Tap the <b>⋮</b> menu in the top-right corner.</li><li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li><li>Confirm <b>Install</b> or <b>Add</b>, then open the new app icon.</li></ol><p class="mini muted">If Chrome shows an install banner, you can use that instead of the menu.</p></section></div><p class="mini muted">Alarm reminders are scheduled by this page and may not fire after the browser or installed app is fully closed.</p><div class="actions"><button type="button" class="secondary" data-close-install-guide>Close</button>${apple&&!isStandaloneApp()?'<button type="button" class="primary" data-install-guide-notifications>Got it</button>':''}</div>`;
 dialog.querySelectorAll('[data-close-install-guide]').forEach(button=>button.addEventListener('click',()=>dialog.close()));
 dialog.querySelectorAll('.install-guide-grid section').forEach((section,index)=>section.classList.toggle('install-platform-current',apple?index===0:index===1));
 dialog.showModal();$('#install-guide-title').focus();
}
function maybePromptInstallGuide(){
 if(isStandaloneApp()||(!isAppleMobile()&&!/Android/i.test(navigator.userAgent)))return;
 try{if(localStorage.getItem('tamaraw_install_guide_seen')==='true')return;localStorage.setItem('tamaraw_install_guide_seen','true');}catch(_){return;}
 setTimeout(()=>{if(!isStandaloneApp()&&!$('#tutorial-dialog')?.open&&!$('#install-guide-dialog')?.open)showInstallGuide();},800);
}
async function enableAlarmNotifications(){
 if(isAppleMobile()&&!isStandaloneApp()){showInstallGuide();toast('Add Tamaraw Time to your Home Screen, then enable alerts from the installed app.');return;}
 if(typeof window.Notification==='undefined'||!('serviceWorker'in navigator)||!window.isSecureContext){toast('Notifications require a supported browser and a secure HTTPS connection.');return;}
 let permission=Notification.permission;
 if(permission==='default'){try{permission=await Notification.requestPermission();}catch(_){toast('The browser could not request notification permission.');return;}}
 if(permission!=='granted'){toast(permission==='denied'?'Allow notifications for Tamaraw Time in your browser or device settings.':'Notification permission was not granted.');render();return;}
 const registration=await ensureServiceWorker();
 if(!registration){toast('Could not start notification support. Reload the app and try again.');return;}
 alarmNotificationsEnabled=true;try{localStorage.setItem('tamaraw_alarm_notifications','true');}catch(_){toast('This browser could not save the alert preference.');alarmNotificationsEnabled=false;}
 render();toast(alarmNotificationsEnabled?'Leave-time notifications are on for this device.':'Could not save the alert setting.');
}
async function installAppOrShowGuide(){
 if(isStandaloneApp()){toast('Tamaraw Time is already installed.');return;}
 if(!deferredInstallPrompt){showInstallGuide();return;}
 const prompt=deferredInstallPrompt;deferredInstallPrompt=null;
 try{await prompt.prompt();const choice=await prompt.userChoice;if(choice?.outcome==='accepted')toast('Tamaraw Time is being installed.');else showInstallGuide();}
 catch(_){showInstallGuide();}
}
async function maybeShowDepartureNotification(next,departureAt){
 if((!loadedUser&&!localMode)||!alarmNotificationsEnabled||typeof window.Notification==='undefined'||Notification.permission!=='granted')return;
 if(!departureNotificationEligible(departureAt))return;
 const key=`${next.id||next.name}|${next.when.getTime()}|${departureAt}`;
 if(key===lastDepartureNotification||key===pendingDepartureNotification)return;
 try{if(localStorage.getItem('tamaraw_last_departure_notification')===key){lastDepartureNotification=key;return;}}catch(_){}
 pendingDepartureNotification=key;
 try{
  const registration=await ensureServiceWorker();if(!registration)return;
  const date=new Date(departureAt),departTime=date.toLocaleTimeString('en-PH',{hour:'numeric',minute:'2-digit',hour12:true,timeZone:'Asia/Manila'});
  await registration.showNotification('Time to leave for class',{body:`Leave now for ${next.name}. Recommended departure: ${departTime}.`,icon:new URL('./assets/icon-192.png',location.href).href,badge:new URL('./assets/favicon.png',location.href).href,tag:`tamaraw-departure-${next.id||date.getTime()}`,renotify:false,requireInteraction:true,data:{url:new URL('./',location.href).href}});
  lastDepartureNotification=key;try{localStorage.setItem('tamaraw_last_departure_notification',key);}catch(_){}
 }catch(error){console.warn('Could not show departure notification:',error);}
 finally{pendingDepartureNotification='';}
}
function refreshDepartureCountdown(){
 if(activeRouteEstimate&&Date.now()-activeRouteEstimate.at>=5*60*1000){activeRouteEstimate=null;const travel=$('#trip-travel');if(travel?.dataset.routeEstimate==='true'){travel.value=state.settings.travel;delete travel.dataset.routeEstimate;updateCommute();}}
 const next=upcoming()[0],departureAt=next?next.when.getTime()-(currentTravel(next,effectiveMode(next))+Number(state.settings.buffer||0))*60000:null;
 if(next)void maybeShowDepartureNotification(next,departureAt);
 const node=$('#leave-countdown');if(!node)return;
 if(!next){node.textContent='Add your first class to calculate your leave time.';return;}
 const seconds=Math.ceil((departureAt-Date.now())/1000);
 if(seconds>0){const h=Math.floor(seconds/3600),m=Math.ceil((seconds%3600)/60);node.textContent=h?`⏳ Leave in ${h} hr ${m} min`:`⏳ Leave in ${m} min`;node.dataset.urgency=seconds<1800?'soon':'normal';}
 else{const elapsed=Math.ceil(-seconds/60);node.textContent=elapsed<180?`⚠️ Recommended departure ${elapsed} min ago`:'⚠️ Scheduled departure time passed';node.dataset.urgency='late';}
}

const departure = (c,travel=state.settings.travel,buffer=state.settings.buffer,prep=state.settings.prep) => {
 const start=timeMinutes(c.time);return {leave:minsToTime(start-travel-buffer),wake:minsToTime(start-travel-buffer-prep),arrive:minsToTime(start-buffer)};
};
function toast(text){const el=$('#toast');el.textContent=text;el.style.display='block';clearTimeout(window.__ttToast);window.__ttToast=setTimeout(()=>el.style.display='none',3500);}
function snapshot(){return {classes:structuredClone(state.classes),tasks:structuredClone(state.tasks),settings:structuredClone(state.settings),onboarding:structuredClone(state.onboarding)};}
function saveToCloud(eventType){
 const data=snapshot();
 if(localMode){localStorage.setItem('tamaraw_local_planner',JSON.stringify(data));return Promise.resolve();}
 const job=writeQueue.catch(()=>{}).then(async()=>{
  await CloudStore.savePayload(data);
  if(eventType)await CloudStore.logEvent(eventType);
 });
 writeQueue=job;job.catch(err=>toast('Could not save online: '+(err.message||err)));
 return job;
}
async function logActivity(type){
 if(localMode)return;
 try{await writeQueue.catch(()=>{});await CloudStore.logEvent(type);}catch(err){toast('Activity log failed: '+(err.message||err));}
}
const tutorialSteps=[
 {title:'Your day, already planned',label:'01 · DASHBOARD',tip:'Upcoming class and departure time appear automatically.',scene:'dashboard'},
 {title:'Choose your class time',label:'02 · CLASS SCHEDULE',tip:'Use the visible AM/PM buttons when adding your subject.',scene:'schedule'},
 {title:'Find your best departure',label:'03 · AUTOMATIC TIMING',tip:'Arrival buffer + travel estimate + get-ready time = your routine.',scene:'departure'},
 {title:'See your commute live',label:'04 · GPS TRACKING',tip:'Allow location permission to see a moving pin and automatic walking/driving estimates.',scene:'map'},
 {title:'Make Tamaraw Time yours',label:'05 · PERSONALIZE',tip:'Change your color theme any time under Settings.',scene:'theme'}
];
function tutorialVisual(scene){
 if(scene==='dashboard')return `<div class="visual-demo visual-dashboard"><div class="visual-header"><i></i><span>Good morning, Tamaraw!</span><b>☀</b></div><div class="visual-tiles"><div><small>NEXT CLASS</small><strong>Data Structures</strong><em>9:00 AM</em></div><div><small>LEAVE BY</small><strong class="visual-big">7:50 AM</strong><em>Calculated for you</em></div></div><div class="visual-progress"><span></span></div></div>`;
 if(scene==='schedule')return `<div class="visual-demo visual-schedule"><div class="visual-header">📚 <span>New class</span></div><div class="visual-input">Data Structures</div><div class="visual-switch"><span>9 : 00</span><span class="visual-chip selected">AM</span><span class="visual-chip">PM</span></div><div class="visual-input">Monday · FEU Tech</div></div>`;
 if(scene==='departure')return `<div class="visual-demo visual-depart"><div class="visual-equation"><span>Class<br><b>9:00 AM</b></span><span>−</span><span>Travel<br><b>55 min</b></span><span>−</span><span>Buffer<br><b>15 min</b></span></div><div class="visual-answer">🚶 LEAVE BY <strong>7:50 AM</strong></div><div class="visual-prepare">☀ GET READY <b>7:05 AM</b></div></div>`;
 if(scene==='map')return `<div class="visual-demo visual-map"><div class="visual-street street-a"></div><div class="visual-street street-b"></div><div class="visual-street street-c"></div><div class="visual-map-route"></div><span class="visual-location">●</span><span class="visual-campus">🎓</span><div class="visual-map-label">📍 Live commute</div></div>`;
 return `<div class="visual-demo visual-themes"><div class="visual-header">🎨 <span>Choose your colors</span></div><div class="visual-theme-sample forest">Forest</div><div class="visual-theme-sample ocean">Ocean</div><div class="visual-theme-sample sunset">Sunset</div><div class="visual-theme-sample night">Night</div></div>`;
}
function drawTutorial(){
 const step=tutorialSteps[tutorialIndex];
 $('#tutorial-step').innerHTML=`<div class="tutorial-visual-wrap" key="${tutorialIndex}">${tutorialVisual(step.scene)}</div><div class="tutorial-caption"><div class="tutorial-tag">${esc(step.label)}</div><h2 id="tutorial-title">${esc(step.title)}</h2><p>${esc(step.tip)}</p></div>`;
 $('#tutorial-dots').innerHTML=tutorialSteps.map((_,i)=>`<span class="${i===tutorialIndex?'active':''}"></span>`).join('');
 $('#tutorial-count').textContent=`${tutorialIndex+1} / ${tutorialSteps.length}`;
 $('#tutorial-prev').disabled=tutorialIndex===0;
 $('#tutorial-next').textContent=tutorialIndex===tutorialSteps.length-1?'Start using the app →':'Next →';
}
function showTutorial(){tutorialIndex=0;drawTutorial();if(!$('#tutorial-dialog').open)$('#tutorial-dialog').showModal();}
function finishTutorial(){state.onboarding.finished=true;$('#tutorial-dialog').close();saveToCloud();}
const badge = label=>`<span class="badge">${esc(label)}</span>`;
const classCard = c => `<div class="item"><div><b>${esc(c.name)}</b><small>${esc(classWeekdays(c).map(d=>days[d].slice(0,3)).join(', '))} · ${ampm(c.time)}–${ampm(c.end)} · ${esc(c.room||'Room not set')}</small><small>${esc(c.campus||state.settings.campus)}${c.travel?` · Class travel estimate ${Number(c.travel)} min`:''}</small></div><div class="actions-inline"><button class="iconbutton" type="button" data-action="edit-class" data-id="${esc(c.id)}" aria-label="Edit ${esc(c.name)}">✎</button><button class="iconbutton" type="button" data-action="del-class" data-id="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">×</button></div></div>`;
function cancelRoadRoute(){++routeSeq;routeAbortController?.abort();routeAbortController=null;routeRequestBusy=false;}
function navigate(next){if(currentPage==='commute'&&next!=='commute'){stopGps();cancelRoadRoute();++jeepneyRequestSerial;jeepneyRequestBusy=false;clearJeepneyMap();clearRailMap();liveMapResizeObserver?.disconnect();liveMapResizeObserver=null;if(liveMap){liveMap.remove();liveMap=null;}}
 currentPage=next;
 document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===next));
 const title={home:['Good day, '+state.settings.name+'! 👋','Focus on arriving to class on time.'],schedule:['Class Schedule','Your weekly class timetable.'],commute:['Commute Planner','Know when to get ready and when to leave.'],settings:['Settings','Adjust your punctuality preferences.']}[next];
 $('#page-title').textContent=title[0];$('#page-subtitle').textContent=title[1];
 $('#quick-add').hidden=next==='settings';
 render();
}
function render(){
 let html='';const next=upcoming()[0],recommendation=next?currentDeparture(next):null;
 if(currentPage==='home'){
  html=`<div class="grid three"><div class="card stat accent"><div class="label">NEXT CLASS</div><div class="value" style="font-size:25px">${next?esc(next.name):'No classes yet'}</div><div class="note">${next?`${esc(days[Number(next.day)])} · ${ampm(next.time)}`:'Add your first class to begin'}</div></div><div class="card stat"><div class="label">SUGGESTED LEAVE TIME</div><div class="value">${recommendation?recommendation.leave:'—'}</div><div class="note">${next?'Calculated from class start, journey and arrival buffer':'Once a class is scheduled'}</div></div><div class="card stat"><div class="label">TRAVEL ESTIMATE</div><div class="value">${esc(currentTravel(next,effectiveMode(next)))} <span style="font-size:17px">min</span></div><div class="note">${activeRouteEstimate&&next&&currentTravel(next,effectiveMode(next))===activeRouteEstimate.minutes?'Auto from GPS route':'Default estimate'} · ${esc(effectiveMode(next))}</div></div></div>
  <div class="section-head"><h2>Plan for punctuality</h2></div><div class="hero"><div><small>${next?'UPCOMING CLASS · '+esc(days[Number(next.day)]):'YOUR PUNCTUALITY ASSISTANT'}</small><h2>${recommendation?'Leave by '+recommendation.leave:'Add your schedule to start'}</h2><small>${recommendation?'Prepare by '+recommendation.wake+' · Aim to arrive '+recommendation.arrive:'Get a personalized departure recommendation'}</small><div id="leave-countdown" class="leave-countdown" aria-live="off"></div></div><button class="primary" data-action="go-commute">Plan my commute →</button></div>
  <div class="card" style="margin-top:21px"><div class="section-head" style="margin:0 0 8px"><h2>Upcoming classes</h2><button class="linkbtn" data-action="go-schedule">View schedule →</button></div>${upcoming().slice(0,4).map(classCard).join('')||'<div class="empty">Your class list is empty. Add a class to get started.</div>'}</div>`;
 }else if(currentPage==='schedule'){
  const parts=manilaDateParts(),today=new Date(Date.UTC(parts.year,parts.month-1,parts.day));
  if(!scheduleMonth)scheduleMonth=new Date(Date.UTC(parts.year,parts.month-1,1));
  if(!scheduleSelectedKey)scheduleSelectedKey=dateKey(today);
  const first=new Date(Date.UTC(scheduleMonth.getUTCFullYear(),scheduleMonth.getUTCMonth(),1)),start=new Date(first);start.setUTCDate(1-first.getUTCDay());
  const monthTitle=new Intl.DateTimeFormat('en-PH',{month:'long',year:'numeric',timeZone:'UTC'}).format(first);
  const cells=Array.from({length:42},(_,i)=>{const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);const key=dateKey(d),inside=d.getUTCMonth()===first.getUTCMonth(),hasClass=state.classes.some(c=>classWeekdays(c).includes(d.getUTCDay()));return `<button type="button" class="calendar-day ${inside?'':'outside'} ${key===scheduleSelectedKey?'selected':''} ${key===dateKey(today)?'today':''}" data-action="select-date" data-date="${key}" aria-label="${dateLabel(d)}${hasClass?', class scheduled':''}" aria-pressed="${key===scheduleSelectedKey}"><span>${d.getUTCDate()}</span>${hasClass?'<i aria-hidden="true"></i>':''}</button>`;}).join('');
  const selected=new Date(`${scheduleSelectedKey}T00:00:00Z`),selectedClasses=state.classes.filter(c=>classWeekdays(c).includes(selected.getUTCDay())).sort((a,b)=>a.time.localeCompare(b.time));
  html=`<div class="section-head"><div><h2>Class calendar</h2><p class="mini muted">Weekly classes appear on each selected weekday.</p></div><button class="primary" data-action="add-class">+ Add class</button></div><div class="calendar-layout"><section class="card calendar-card" aria-label="Monthly class calendar"><div class="calendar-heading"><button class="secondary" data-action="month-prev" aria-label="Previous month">‹</button><h3>${monthTitle}</h3><button class="secondary" data-action="month-next" aria-label="Next month">›</button></div><div class="calendar-grid calendar-weekdays">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="calendar-grid">${cells}</div></section><section class="calendar-agenda"><h3>${dateLabel(selected)}</h3><p class="mini muted">${selectedClasses.length} ${selectedClasses.length===1?'class':'classes'} planned</p>${selectedClasses.map(classCard).join('')||'<div class="empty">No classes on this day. Add a class to plan ahead.</div>'}<button class="secondary" data-action="add-class">+ Add class for this day</button></section></div><div class="alert" style="margin-top:18px">Add your real class times. This app does not automatically import FEU attendance records.</div>`;
 }else if(currentPage==='commute'){
  const opts=upcoming().map(c=>`<option value="${esc(c.id)}">${esc(c.name)} — ${esc(days[Number(c.day)])} ${ampm(c.time)}</option>`).join('');
  html=`<section class="commute-experience" id="commute-experience"><div id="map-host" class="commute-map map-host" aria-label="Interactive OpenStreetMap"></div><div class="commute-topline"><button type="button" class="secondary" data-action="go-home">← Dashboard</button><b>FEU · COMMUTE PLANNER</b><span class="commute-map-credit">© OpenStreetMap</span></div><section class="commute-panel" aria-label="Plan your commute"><div class="commute-panel-head"><div><small>YOUR NEXT JOURNEY</small><h2>Where are you headed?</h2></div>${badge('Automatic ETA')}</div><div class="field"><label for="class-select">Destination / class</label><select id="class-select">${opts||'<option value="">Add a class first</option>'}</select></div><input id="trip-travel" type="hidden" value="${currentTravel(upcoming()[0])}"><div id="commute-controls"></div><div class="commute-fields"><div class="field"><label for="trip-mode">Travel mode</label><select id="trip-mode">${['Transit','Jeepney','Train','Bus / UV','Driving','Walking'].map(m=>`<option ${state.settings.mode===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label>Departure</label><div class="departure-choice">◷ <span>Leave now</span></div></div></div><div class="commute-fields commute-actions"><button class="secondary" type="button" data-action="location">◎ Use my location</button><button class="secondary" type="button" data-action="pick-map-origin">Pick on map</button><button class="primary" type="button" data-action="show-map">Find route</button></div><p class="mini muted commute-gps" id="gps-output" role="status">GPS is off. Choose an origin or allow location access.</p><div class="commute-eta" aria-live="polite"><span>ESTIMATED TRAVEL TIME</span><strong id="eta-summary">${activeRouteEstimate?`${activeRouteEstimate.minutes} min`:'Waiting for route'}</strong><small id="eta-status">${activeRouteEstimate?'Updated from route':'Select an origin to calculate automatically'}</small></div><div id="route-info" class="route-info" aria-live="polite"></div><details class="commute-preferences"><summary>Arrival preferences</summary><div class="formgrid"><div class="field"><label for="trip-prep">Get ready (min)</label><input id="trip-prep" type="number" min="0" max="240" value="${state.settings.prep}"></div><div class="field"><label for="trip-buffer">Arrive early (min)</label><input id="trip-buffer" type="number" min="0" max="120" value="${state.settings.buffer}"></div></div><button class="secondary" data-action="save-commute">Save preferences</button></details><details class="commute-preferences"><summary>Station and route references</summary><p class="mini muted">Reviewed station and historical route records are references, not confirmation of current service.</p><button type="button" class="secondary" data-action="show-rail-directory">Browse reviewed rail stations</button> <button type="button" class="secondary" data-action="show-historical">Browse historical routes</button><div id="transit-reference-results"></div></details><div class="commute-routine"><h3>Your recommended routine</h3><div id="commute-output"></div></div><p class="mini muted commute-disclaimer">Walking and driving ETAs are calculated from routed distance and service estimates, without live traffic. Local transit data is not live-confirmed; rail timetables and jeepney ride times are unavailable. Map providers receive route coordinates when you search.</p></section></section>`;
 }else if(currentPage==='settings'){
  html=`<div class="grid two"><div class="card"><h2>Student preferences</h2><form id="settings-form"><div class="field"><label>Name</label><input name="name" maxlength="40" required value="${esc(state.settings.name)}"></div><div class="field"><label>Preferred FEU campus</label><select name="campus">${Object.keys(campusOptions).map(c=>`<option ${state.settings.campus===c?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="field"><label>Travel mode</label><select name="mode">${['Transit','Jeepney','Train','Bus / UV','Driving','Walking'].map(m=>`<option ${state.settings.mode===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label>Default travel time (min)</label><input name="travel" type="number" min="1" max="480" required value="${state.settings.travel}"></div><div class="field"><label>Get-ready time (min)</label><input name="prep" type="number" min="0" max="240" required value="${state.settings.prep}"></div><div class="field"><label>Arrival buffer (min)</label><input name="buffer" type="number" min="0" max="120" required value="${state.settings.buffer}"></div><div class="field"><label>Color scheme</label><div class="theme-grid" role="radiogroup" aria-label="App color scheme">${Object.entries(themeNames).map(([key,label])=>`<button type="button" role="radio" aria-checked="${(state.settings.theme||'forest')===key}" class="theme-choice ${(state.settings.theme||'forest')===key?'selected':''}" data-theme-choice="${key}"><span class="theme-swatch theme-${key}" aria-hidden="true"></span><span>${label}</span><span class="theme-check">✓</span></button>`).join('')}</div><input type="hidden" name="theme" value="${esc(state.settings.theme||'forest')}"></div><button class="primary" type="submit">Save settings</button></form></div><div class="stack"><div class="card"><h2>Your account</h2><p class="muted">Your class schedule and commute preferences are saved in your Tamaraw Time account in Supabase. Study activity is recorded privately for the research team, not shown as a student progress score.</p><button type="button" class="secondary" data-action="change-password">Change password</button><button type="button" class="secondary" data-action="refresh-cloud">Refresh cloud data</button><button type="button" class="secondary" data-action="export">Export your schedule (JSON)</button><button type="button" class="danger" data-action="reset">Clear schedule and preferences</button><div class="settings-help"><h3>First-time guide</h3><p class="mini muted">Replay the short punctuality and commute tutorial.</p><button type="button" class="secondary" data-action="tutorial">Replay tutorial</button></div></div></div></div>`;
 }
 $('#content').classList.remove('tt-enter');
 $('#content').innerHTML=html;
 if(currentPage==='settings'){const form=$('#settings-form'),defaultsPanel=document.createElement('fieldset');defaultsPanel.className='field campus-travel-defaults';defaultsPanel.innerHTML=`<legend>Default travel time by campus (minutes)</legend><div class="campus-default-grid">${Object.keys(campusOptions).map(c=>`<label>${esc(c)}<input name="campusTravel:${esc(c)}" type="number" min="1" max="480" value="${esc(state.settings.campusTravel?.[c]||'')}" placeholder="Use general default"></label>`).join('')}</div>`;form.insertBefore(defaultsPanel,form.querySelector('button[type="submit"]'));}
 if(localMode&&currentPage==='settings'){const card=$('#content .stack .card');card.querySelector('h2').textContent='Device planner';card.querySelector('p').textContent='Your schedule and preferences stay in this browser on this device. This data is separate from cloud accounts and is not sent to the research database.';card.querySelector('[data-action="change-password"]').remove();card.querySelector('[data-action="refresh-cloud"]').textContent='Reload device data';}
 if(currentPage==='home'||currentPage==='settings'){const holder=document.createElement('div');holder.innerHTML=deviceSetupCard();const panel=holder.firstElementChild;if(currentPage==='home'){const anchor=$('#content .section-head');if(anchor)anchor.before(panel);else $('#content').prepend(panel);}else $('#content .stack').append(panel);}
 void $('#content').offsetWidth;
 $('#content').classList.add('tt-enter');
 refreshDepartureCountdown();
 if(currentPage==='commute'){
  const planner=$('#commute-controls'),originControl=document.createElement('div');originControl.className='origin-controls';originControl.innerHTML=`<div class="field"><label for="origin-mode">Origin</label><select id="origin-mode"><option value="gps" ${originMode==='gps'?'selected':''}>My live location (GPS)</option><option value="campus" ${originMode==='campus'?'selected':''}>FEU campus</option><option value="map" ${originMode==='map'?'selected':''}>Choose on map</option><option value="coordinates" ${originMode==='coordinates'?'selected':''}>Enter coordinates</option></select></div><div class="field" id="origin-campus-field" ${originMode==='campus'?'':'hidden'}><label for="origin-campus">Starting campus</label><select id="origin-campus">${Object.keys(campusOptions).map(c=>`<option ${c==='FEU Manila'?'selected':''}>${esc(c)}</option>`).join('')}</select></div><div class="field" id="origin-coordinates-field" ${originMode==='coordinates'?'':'hidden'}><label for="origin-coordinates">Latitude, longitude</label><input id="origin-coordinates" type="text" inputmode="decimal" value="${esc(coordinateOriginText)}" placeholder="14.6043, 120.9884"></div><button type="button" class="secondary" id="pick-origin" ${originMode==='map'?'':'hidden'}>Pick origin on map</button><p class="mini muted" id="origin-status"></p>`;planner.append(originControl);const modeInput=$('#origin-mode');modeInput.addEventListener('change',()=>{originMode=modeInput.value;$('#origin-campus-field').hidden=originMode!=='campus';$('#origin-coordinates-field').hidden=originMode!=='coordinates';$('#pick-origin').hidden=originMode!=='map';originPickerActive=false;invalidateOriginRoute();updateOriginStatus();scheduleAutoRoute(true);});$('#origin-campus').addEventListener('change',()=>{invalidateOriginRoute();updateOriginStatus();scheduleAutoRoute(true);});$('#origin-coordinates').addEventListener('input',event=>{coordinateOriginText=event.target.value;invalidateOriginRoute();updateOriginStatus();scheduleAutoRoute(true);});$('#pick-origin').addEventListener('click',()=>{originMode='map';originPickerActive=true;invalidateOriginRoute();$('#origin-mode').value='map';updateOriginStatus();toast('Tap the map to set the trip starting point.');});updateOriginStatus();
  updateCommute();
  $('#class-select').addEventListener('change',()=>{cancelRoadRoute();++jeepneyRequestSerial;jeepneyRequestBusy=false;if(activeRouteEstimate?.campus!==(selectedClass()?.campus||state.settings.campus))activeRouteEstimate=null;$('#trip-travel').value=currentTravel(selectedClass(),$('#trip-mode').value);if(activeRouteEstimate)$('#trip-travel').dataset.routeEstimate='true';else delete $('#trip-travel').dataset.routeEstimate;updateCommute();resetMapForCampus();scheduleAutoRoute(true);});
  for(const id of ['trip-buffer','trip-prep'])$('#'+id).addEventListener('input',updateCommute);
  $('#trip-mode').addEventListener('change',()=>{cancelRoadRoute();++jeepneyRequestSerial;jeepneyRequestBusy=false;activeRouteEstimate=null;clearRouteOverlays();$('#trip-travel').value=currentTravel(selectedClass(),$('#trip-mode').value);delete $('#trip-travel').dataset.routeEstimate;$('#eta-summary').textContent='Calculating…';updateCommute();renderTransportNote();scheduleAutoRoute(true);});
  initLiveMap();
 }
}
async function renderRailDirectory(target){
 target.innerHTML='<p class="mini muted">Loading reviewed station directory…</p>';
 try{const graph=await TamarawTransit.load(),query=$('#rail-directory-search')?.value.trim().toLowerCase()||'';const stations=graph.stops.filter(s=>!query||`${s.name} ${s.id}`.toLowerCase().includes(query));target.innerHTML=`<p class="mini muted">${graph.stops.length} station records · boarding access is limited to verified mapped entrances. Track topology is not live service status.</p><label class="field">Search stations<input id="rail-directory-search" type="search" value="${esc($('#rail-directory-search')?.value||'')}" placeholder="Station name or line"></label><div class="reference-list">${stations.slice(0,60).map(s=>`<div class="reference-row"><b>${esc(s.name)}</b><span>${esc(s.id.split(':')[0])} · ${s.boarding_allowed===false?'reference only, no mapped public entrance':'mapped public entrance'}</span><a href="${esc(s.review.source_url)}" target="_blank" rel="noopener noreferrer">Source ↗</a></div>`).join('')||'<p>No matching stations.</p>'}${stations.length>60?'<p class="mini muted">Showing first 60 results. Refine your search.</p>':''}</div>`;}catch(error){target.innerHTML=`<p class="alert">${esc(error.message||'Reviewed station directory unavailable.')}</p>`;}
}
async function renderHistoricalDirectory(target){
 target.innerHTML='<p class="mini muted">Loading the historical transit archive…</p>';
 try{historicalCatalogPromise??=fetch('./assets/transit/sakay_historical.json').then(r=>{if(!r.ok)throw Error('Historical route archive could not be loaded.');return r.json();});const catalog=await historicalCatalogPromise;if(catalog.status!=='historical_reference_only')throw Error('Historical route file did not pass its reference-only check.');const query=$('#historical-search')?.value.trim().toLowerCase()||'',routes=catalog.routes.filter(r=>`${r.name} ${r.short_name||''} ${r.description||''} ${r.mode}`.toLowerCase().includes(query)),stops=catalog.stops;target.innerHTML=`<div class="alert"><b>HISTORICAL / UNVERIFIED</b> · This Sakay GTFS archive ends in June 2020. Route names and sample stop order do not confirm current operation, fares or arrival times. Do not use it for trip planning.</div><p class="mini muted">${catalog.routes.length} archived route records · source: <a href="${esc(catalog.source_url)}" target="_blank" rel="noopener noreferrer">Sakay.ph GTFS ↗</a> · licensed data: <a href="./assets/transit/sakay_gtfs_LICENSE.md" target="_blank" rel="noopener noreferrer">license</a></p><label class="field">Search archived routes<input id="historical-search" type="search" value="${esc($('#historical-search')?.value||'')}" placeholder="Route, line or mode"></label><div class="reference-list">${routes.slice(0,25).map(route=>{const sequence=(route.ordered_stops_from_one_sample_trip||[]).slice().sort((a,b)=>a.sequence-b.sequence),names=sequence.map(item=>stops[item.stop_id]?.name||item.stop_id);return `<details class="historical-route"><summary><b>${esc(route.name)}</b><span>${esc(route.short_name||route.mode)} · historical</span></summary><p class="mini muted">${esc(route.description||'Historical route record.')} · ${sequence.length} stops in one archived trip sample.</p><ol>${names.map(name=>`<li>${esc(name)}</li>`).join('')}</ol></details>`;}).join('')||'<p>No matching archived routes.</p>'}${routes.length>25?'<p class="mini muted">Showing 25 results. Refine the search for other records.</p>':''}</div>`;}catch(error){historicalCatalogPromise=null;target.innerHTML=`<p class="alert">${esc(error.message||'Historical route archive unavailable.')}</p>`;}
}
function selectedClass(){return state.classes.find(c=>c.id===$('#class-select')?.value)||upcoming()[0]||null;}
function updateCommute(){
 const target=$('#commute-output');if(!target)return;
 const c=selectedClass();if(!c){target.innerHTML='<div class="empty">Add a class to calculate departure times.</div>';return;}
 const value=id=>Math.max(0,Number($('#'+id)?.value)||0);
 const travel=value('trip-travel'),buffer=value('trip-buffer'),prep=value('trip-prep');
 const result=departure(c,travel,buffer,prep);
 const auto=activeRouteEstimate&&activeRouteEstimate.campus===(c.campus||state.settings.campus)&&activeRouteEstimate.mode===$('#trip-mode')?.value&&Math.abs(activeRouteEstimate.minutes-travel)<.01;
 const mode=$('#trip-mode')?.value||'Transit',hasOrigin=!!selectedOrigin();
 if($('#eta-status'))$('#eta-status').textContent=auto?'Route ETA updated automatically':hasOrigin&&['Walking','Driving'].includes(mode)?'Calculating route; saved estimate shown':hasOrigin?'Transit timing unavailable; saved estimate shown':'Saved estimate · choose an origin for automatic ETA';
 if($('#eta-summary'))$('#eta-summary').textContent=`${travel} min`;
 target.innerHTML=`<div class="highlight"><strong>${esc(c.name)}</strong><div class="mini">${esc(days[Number(c.day)])} · Starts ${ampm(c.time)} · ${esc(c.campus||state.settings.campus)}</div></div><div class="results"><div class="result"><span>Get ready</span><b>${result.wake}</b></div><div class="result"><span>Leave by</span><b>${result.leave}</b></div><div class="result"><span>Be there by</span><b>${result.arrive}</b></div></div><p class="mini muted">Departure is calculated from class time, the current journey estimate, and your arrival buffer. ${auto?'Journey time comes from the selected route.':'The saved travel estimate is used until route data can calculate an ETA.'} No live traffic prediction.</p>`;
}
function destinationCoords(){return campusCoords[selectedClass()?.campus||state.settings.campus]||campusCoords['FEU Tech'];}
function selectedOrigin(){const mode=$('#origin-mode')?.value||originMode;if(mode==='gps')return gpsPosition?{point:{...gpsPosition},label:'Current GPS position'}:null;if(mode==='map')return customOrigin?{point:{...customOrigin},label:'Map-selected point'}:null;if(mode==='campus'){const campus=$('#origin-campus')?.value||'FEU Manila',coords=campusCoords[campus];return coords?{point:{lat:coords[0],lng:coords[1]},label:campus}:null;}if(mode==='coordinates'){const values=String($('#origin-coordinates')?.value||coordinateOriginText).split(',').map(Number),[lat,lng]=values;if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180)return null;return {point:{lat,lng},label:'Entered coordinates'};}return null;}
function updateOriginStatus(){const status=$('#origin-status');if(!status)return;const origin=selectedOrigin();status.textContent=origin?`Route origin: ${origin.label} · ${origin.point.lat.toFixed(5)}, ${origin.point.lng.toFixed(5)}`:($('#origin-mode')?.value||originMode)==='map'?'Tap Pick origin, then tap a point on the map.':($('#origin-mode')?.value||originMode)==='gps'?'Start live GPS to use your current location.':'Enter valid latitude, longitude coordinates.';}
function invalidateOriginRoute(){activeRouteEstimate=null;cancelRoadRoute();++jeepneyRequestSerial;jeepneyRequestBusy=false;clearRouteOverlays();updateCommute();renderTransportNote();}
function setOriginMarker(){if(!liveMap||!customOrigin)return;if(originMarker)liveMap.removeLayer(originMarker);originMarker=L.circleMarker([customOrigin.lat,customOrigin.lng],{radius:9,color:'#fff',weight:3,fillColor:'#d59622',fillOpacity:1}).addTo(liveMap).bindPopup('Selected route origin');}
function initLiveMap(){
 if(!window.L){$('#map-host').textContent='Map library unavailable. Check your internet connection.';return;}
 liveMapResizeObserver?.disconnect();liveMapResizeObserver=null;
 if(liveMap){clearRouteOverlays();if(originMarker)liveMap.removeLayer(originMarker);liveMap.remove();liveMap=null;}liveMarker=null;campusMarker=null;liveRoute=null;originMarker=null;
 const dest=destinationCoords();liveMap=L.map('map-host',{zoomControl:true}).setView(dest,14);
 L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(liveMap);
 const tiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',errorTileUrl:'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='}).addTo(liveMap);
 tiles.on('tileerror',event=>{
  const tile=event.tile,coords=event.coords;
  if(!tile||!coords||tile.dataset.ttFallback)return;
  tile.dataset.ttFallback='true';
  tile.addEventListener('load',fallbackEvent=>fallbackEvent.stopImmediatePropagation(),{once:true,capture:true});
  tile.addEventListener('error',fallbackEvent=>{fallbackEvent.stopImmediatePropagation();tile.style.opacity='0';},{once:true,capture:true});
  tile.src=`https://tile.openstreetmap.de/${coords.z}/${coords.x}/${coords.y}.png`;
 });
 campusMarker=L.marker(dest).addTo(liveMap).bindPopup('Your selected FEU campus');
 liveMap.on('click',event=>{if(!originPickerActive)return;customOrigin={lat:event.latlng.lat,lng:event.latlng.lng};originPickerActive=false;originMode='map';$('#origin-mode').value='map';setOriginMarker();invalidateOriginRoute();updateOriginStatus();scheduleAutoRoute(true);toast('Map origin selected. Calculating your route.');});
 if(gpsPosition)updateGpsMarker();if(customOrigin)setOriginMarker();renderTransportNote();
 const mapElement=$('#map-host');
 if(window.ResizeObserver){liveMapResizeObserver=new ResizeObserver(()=>liveMap?.invalidateSize({pan:false,debounceMoveend:true}));liveMapResizeObserver.observe(mapElement);}
 liveMap.whenReady(()=>{requestAnimationFrame(()=>requestAnimationFrame(()=>liveMap?.invalidateSize({pan:false,debounceMoveend:true})));setTimeout(()=>liveMap?.invalidateSize({pan:false,debounceMoveend:true}),350);});
}
function resetMapForCampus(){if(!liveMap)return;const dest=destinationCoords();campusMarker.setLatLng(dest);clearRouteOverlays();if(gpsPosition)liveMap.fitBounds([dest,[gpsPosition.lat,gpsPosition.lng]],{padding:[35,35]});else liveMap.setView(dest,14);renderTransportNote();}
function updateGpsMarker(){if(!liveMap||!gpsPosition)return;const p=[gpsPosition.lat,gpsPosition.lng];if(!liveMarker){liveMarker=L.circleMarker(p,{radius:11,color:'#ffffff',weight:3,fillColor:'#1976d2',fillOpacity:1,className:'tt-gps-marker'}).addTo(liveMap).bindPopup('Your live position');liveMap.fitBounds([p,destinationCoords()],{padding:[45,45],maxZoom:16});}else liveMarker.setLatLng(p);}
function stopGps(){if(gpsWatchId!==null){navigator.geolocation.clearWatch(gpsWatchId);gpsWatchId=null;}if(autoRouteTimer){clearTimeout(autoRouteTimer);autoRouteTimer=null;}cancelRoadRoute();gpsPosition=null;lastRouteOrigin=null;lastRouteAt=0;if(originMode==='gps'&&activeRouteEstimate){activeRouteEstimate=null;const input=$('#trip-travel');if(input?.dataset.routeEstimate==='true'){input.value=state.settings.travel;delete input.dataset.routeEstimate;}updateCommute();}if(liveMarker&&liveMap)liveMap.removeLayer(liveMarker);liveMarker=null;const el=$('#gps-output');if(el)el.textContent='Live GPS tracking stopped.';updateOriginStatus();}
function scheduleAutoRoute(force=false){
 if(autoRouteTimer)clearTimeout(autoRouteTimer);
 const mode=$('#trip-mode')?.value;if(!liveMap||!selectedOrigin())return;
 if(!force&&routeRequestBusy)return;
 const moved=lastRouteOrigin&&distanceMeters(gpsPosition,lastRouteOrigin)>=250;
 if(moved&&activeRouteEstimate){activeRouteEstimate=null;const input=$('#trip-travel');if(input?.dataset.routeEstimate==='true'){input.value=state.settings.travel;delete input.dataset.routeEstimate;}updateCommute();}
 if(!force&&lastRouteOrigin&&!moved&&Date.now()-lastRouteAt<5*60*1000)return;
 autoRouteTimer=setTimeout(()=>{autoRouteTimer=null;findLiveRoute(true);},force?300:1400);
}
function clearJeepneyMap(){jeepneySelectionSerial++;for(const marker of [...jeepneyMarkers,...jeepneyWalkLayers])if(liveMap)liveMap.removeLayer(marker);jeepneyMarkers=[];jeepneyWalkLayers=[];jeepneyOptions=[];}
function clearRailMap(){for(const layer of railLayers)if(liveMap)liveMap.removeLayer(layer);railLayers=[];railOptions=[];}
function clearRouteOverlays(){if(liveRoute&&liveMap)liveMap.removeLayer(liveRoute);liveRoute=null;clearJeepneyMap();clearRailMap();}
function renderTransportNote(){
 const el=$('#route-info');if(!el)return;
 const mode=$('#trip-mode')?.value||'Transit';
 if(mode==='Jeepney')el.innerHTML='<div class="alert">Choose an origin to search mapped direct jeepney services and pedestrian paths to and from stops. Results are not live-confirmed operating services. Jeepney ride duration and a total ETA are unavailable.</div>';
 else if(mode==='Train'||mode==='Transit')el.innerHTML='<div class="alert">Choose an origin to check reviewed rail connections and pedestrian access. Rail timetables are unavailable, so the planner will show a total ETA only when reviewed duration data exists.</div>';
 else if(['Train','Bus / UV','Transit'].includes(mode))el.innerHTML='<div class="alert">'+esc(mode)+' routing is not available within this app yet. Use Sakay.ph for transit planning. Departure uses your editable journey estimate.</div>';
 else el.innerHTML='<div class="alert">'+esc(mode)+' route preview is available when GPS is enabled. Times are estimates, not real-time traffic predictions.</div>';
}
async function selectJeepneyRoute(index){
 const route=jeepneyOptions[index],selected=selectedOrigin();if(!route||!liveMap||!selected)return;
 const seq=++jeepneySelectionSerial,origin={...selected.point},campus=destinationCoords();
 if(liveRoute)liveMap.removeLayer(liveRoute);
 for(const marker of [...jeepneyMarkers,...jeepneyWalkLayers])liveMap.removeLayer(marker);
 jeepneyMarkers=[];jeepneyWalkLayers=[];
 liveRoute=L.polyline(route.points,{color:'#ed9d25',weight:6,opacity:.96,className:'tt-route-line'}).addTo(liveMap);
 const stops=[{point:route.board,caption:'Mapped boarding stop',color:'#1e9b73'},{point:route.alight,caption:'Mapped alighting stop',color:'#cc6239'}];
 for(const item of stops){const marker=L.circleMarker([item.point.lat,item.point.lng],{radius:9,color:'#fff',weight:3,fillColor:item.color,fillOpacity:1}).addTo(liveMap).bindPopup('<b>'+item.caption+'</b><br>'+esc(item.point.name));jeepneyMarkers.push(marker);}
 const bounds=L.latLngBounds([route.board.lat,route.board.lng],[route.alight.lat,route.alight.lng]);
 bounds.extend([origin.lat,origin.lng]);bounds.extend(campus);liveMap.fitBounds(bounds,{padding:[40,40],maxZoom:15});
 document.querySelectorAll('.jeepney-route').forEach((node,i)=>{node.classList.toggle('selected',i===index);node.setAttribute('aria-pressed',String(i===index));});
 const details=$('#jeepney-plan');if(!details)return;
 details.innerHTML='<div class="jeepney-loading">Checking pedestrian paths to and from mapped stops…</div>';
 const step=(number,title,content)=>'<li><b>'+number+'. '+title+'</b><span>'+content+'</span></li>';
 const distanceText=leg=>leg.status==='routed'?(leg.distanceMeters+' m · approximately '+leg.minutes+' min walking (routing estimate)'):(leg.status==='short'?'Nearby stop (short connection)':'Pedestrian route unavailable; see stop location on the map');
 try{
  const walk=await JeepneyRouting.planWalkingLegs(origin,{lat:campus[0],lng:campus[1]},route);
  if(seq!==jeepneySelectionSerial||currentPage!=='commute'||$('#trip-mode')?.value!=='Jeepney')return;
  for(const leg of [walk.access,walk.exit]){
   if(leg.status!=='routed')continue;
   jeepneyWalkLayers.push(L.polyline(leg.points,{color:'#1976d2',weight:5,dashArray:'7 8',opacity:.9}).addTo(liveMap));
  }
  let summary='Jeepney ride duration, waiting, and traffic are unknown.';
  if(walk.knownWalkingMinutes!==null)summary+=' Known walking segments: approximately '+walk.knownWalkingMinutes+' minutes total.';
  details.innerHTML='<div class="jeepney-plan"><h3>Suggested mapped journey · one jeepney</h3><ol>'+step(1,'Walk to boarding stop',esc(route.board.name)+' — '+esc(distanceText(walk.access)))+step(2,'Board jeepney',esc(route.ref?route.ref+' · '+route.name:route.name)+' (mapped service; verify signage and availability)')+step(3,'Get off',esc(route.alight.name)) +step(4,'Walk to campus',esc(distanceText(walk.exit)))+'</ol><p class="mini muted">'+esc(summary)+' The departure calculator continues using the manual total journey estimate, including all walking, waiting and riding.</p></div>';
 }catch(err){if(seq===jeepneySelectionSerial&&details)details.innerHTML='<div class="alert">The route line is mapped, but walking directions could not be loaded. Confirm walking access locally.</div>';}
}

async function findJeepneyRoutes(){
 const el=$('#route-info');if(!el||!liveMap)return;
 const selected=selectedOrigin();if(!selected){el.innerHTML='<div class="alert">Choose a starting point first. GPS, an FEU campus, map point or coordinates are supported.</div>';return;}
 if(jeepneyRequestBusy){el.textContent='A jeepney search is already in progress…';return;}
 if(!window.JeepneyRouting){el.textContent='Jeepney route service failed to load. Refresh the page or try Sakay.ph.';return;}
 const requestId=++jeepneyRequestSerial;
 const origin={...selected.point},dest=destinationCoords();
 clearRouteOverlays();jeepneyRequestBusy=true;
 el.innerHTML='<div class="jeepney-loading" role="status">🚌 Looking for mapped jeepney routes and stops near your location… This may take a few seconds.</div>';
 try{
  const result=await JeepneyRouting.findRoutes(origin,{lat:dest[0],lng:dest[1]});
  if(requestId!==jeepneyRequestSerial||currentPage!=='commute'||$('#trip-mode')?.value!=='Jeepney')return;
  if(result.status!=='found'){
   el.innerHTML='<div class="alert">'+esc(result.message)+'</div><p class="mini muted">Your departure time still uses your editable travel estimate. We cannot infer jeepney itineraries from a road route alone.</p><a class="jeepney-fallback" href="https://sakay.ph/" target="_blank" rel="noopener noreferrer">Check transit options on Sakay.ph ↗</a>';
   return;
  }
  jeepneyOptions=result.routes;
  el.innerHTML='<div class="jeepney-results-title"><strong>'+result.routes.length+' mapped jeepney connection'+(result.routes.length===1?'':'s')+'</strong><span class="mini muted">OSM data · single-ride candidates, not live-verified</span></div><div class="jeepney-list">'+result.routes.map((r,i)=>'<button type="button" class="jeepney-route" data-action="select-jeepney" data-index="'+i+'" aria-pressed="false"><span class="jeepney-route-head">🚌 '+esc(r.ref?`${r.ref} · ${r.name}`:r.name)+'</span><span class="jeepney-route-step">Board at mapped stop: <b>'+esc(r.board.name)+'</b> ('+r.accessMeters+' m straight-line distance)</span><span class="jeepney-route-step">Alight at mapped stop: <b>'+esc(r.alight.name)+'</b> ('+r.exitMeters+' m straight-line distance)</span><span class="jeepney-route-source">OSM relation #'+r.id+' · View route on map</span></button><a class="jeepney-osm-source" href="'+r.sourceUrl+'" target="_blank" rel="noopener noreferrer">View OSM source #'+r.id+' ↗</a>').join('')+'</div><div id="jeepney-plan" aria-live="polite"></div><div class="alert">Mapped stop coordinates are not walking directions or proof that boarding is legally permitted today. Confirm route, direction, boarding rules, and fares locally. Jeepney departure still uses your editable estimate—no live transit ETA is available.</div><a class="jeepney-fallback" href="https://sakay.ph/" target="_blank" rel="noopener noreferrer">Cross-check with Sakay.ph ↗</a>';
  selectJeepneyRoute(0);
 }catch(error){
  if(requestId!==jeepneyRequestSerial||currentPage!=='commute')return;
  el.innerHTML='<div class="alert">Jeepney map data could not be loaded ('+esc(error.message||'network error')+'). Your manual travel estimate remains unchanged.</div><a class="jeepney-fallback" href="https://sakay.ph/" target="_blank" rel="noopener noreferrer">Find transit directions on Sakay.ph ↗</a>';
 }finally{if(requestId===jeepneyRequestSerial)jeepneyRequestBusy=false;}
}

function drawRailOption(index){
 const option=railOptions[index];if(!option||!liveMap)return;
 for(const layer of railLayers)liveMap.removeLayer(layer);railLayers=[];
 const line=(points,style)=>{if(Array.isArray(points)&&points.length>1)railLayers.push(L.polyline(points,style).addTo(liveMap));};
 line(option.access.points,{color:'#167a64',weight:5,opacity:.9,dashArray:'7 7'});
 for(const edge of option.edges){const points=edge.geometry?.coordinates?.map(p=>[Number(p[1]),Number(p[0])])||[];line(points,{color:edge.line==='LRT-1'?'#25834f':edge.line==='LRT-2'?'#8957a5':'#dc7041',weight:6,opacity:.88});}
 line(option.egress.points,{color:'#167a64',weight:5,opacity:.9,dashArray:'7 7'});
 const from=option.stops[0],to=option.stops.at(-1);
 for(const stop of [from,to])if(stop)railLayers.push(L.circleMarker([stop.access_coordinates[1],stop.access_coordinates[0]],{radius:7,color:'#fff',weight:2,fillColor:'#0f3027',fillOpacity:1}).addTo(liveMap).bindPopup(esc(stop.name)));
 if(railLayers.length)liveMap.fitBounds(L.featureGroup(railLayers).getBounds(),{padding:[35,35],maxZoom:14});
 document.querySelectorAll('.rail-option').forEach((b,i)=>b.setAttribute('aria-pressed',String(i===index)));
 if(Number.isFinite(option.totalSeconds)&&option.totalSeconds>0){const minutes=Math.max(1,Math.ceil(option.totalSeconds/60));activeRouteEstimate={minutes,mode:$('#trip-mode')?.value||'Transit',campus:selectedClass()?.campus||state.settings.campus,at:Date.now()};if($('#trip-travel'))$('#trip-travel').value=minutes;updateCommute();}
 const total=Number.isFinite(option.totalSeconds)?`Reviewed route duration: ${Math.ceil(option.totalSeconds/60)} min`:'Total rail ETA unavailable; keep using your editable commute estimate.';
 const fare=option.fare?`<p class="mini"><b>Fare reference:</b> ₱${Number(option.fare.amount).toFixed(2)} · ${esc(option.fare.label)}. This is the published LRT-2 stored-value matrix, not a single-journey ticket quote.</p>`:'<p class="mini muted">Fare unavailable for this route. No fare was inferred from map distance.</p>';
 const sourceLinks=[...new Set(option.edges.map(e=>e.line_uri).filter(Boolean))].map(u=>`<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(option.edges.find(e=>e.line_uri===u)?.line||'OSM rail relation')} ↗</a>`).join(' · ');
 const details=$('#rail-selected-detail');if(details)details.innerHTML=`<div class="alert"><b>${esc(from?.name||'Station')} → ${esc(to?.name||'Station')}</b><br>${esc(option.lines.join(' · '))} · ${option.transfers} transfer${option.transfers===1?'':'s'}<br>Walking including station access, interchange and exit: ${Math.round(option.walkMeters)} m combined; ${Math.ceil(option.access.seconds/60)} min to station + ${Math.ceil(option.egress.seconds/60)} min from station.<br>${esc(total)}</div>${fare}<p class="mini">Track geometry shows network topology, not real-time trains or confirmed operations. Check service notices before travel.</p><p class="mini">${sourceLinks}</p>`;
}
async function findRailRoutes(){
 const el=$('#route-info');if(!el||!liveMap)return;
 const selected=selectedOrigin();if(!selected){el.innerHTML='<div class="alert">Choose a starting point first. GPS, an FEU campus, map point or coordinates are supported.</div>';return;}
 clearRouteOverlays();const requestSeq=routeSeq;el.innerHTML='<div class="jeepney-loading">Checking reviewed rail connections and pedestrian access routes…</div>';
 try{
  const result=await TamarawTransit.estimate(selected.point,{lat:destinationCoords()[0],lng:destinationCoords()[1]},$('#trip-mode')?.value||'Transit');
  if(requestSeq!==routeSeq||currentPage!=='commute'||!['Train','Transit'].includes($('#trip-mode')?.value))return;
  railOptions=result.options||[];
  if(!railOptions.length){el.innerHTML='<div class="alert">No connected reviewed rail journey with a mapped pedestrian route was found near this origin and campus. Walking/driving estimates and the editable commute time remain separate options.</div><a href="https://sakay.ph/" target="_blank" rel="noopener noreferrer">Check public transit routes on Sakay.ph ↗</a>';return;}
  el.innerHTML=`<div class="jeepney-results-title"><strong>${railOptions.length} reviewed rail option${railOptions.length===1?'':'s'}</strong><span class="mini muted">OSM network · pedestrian access checked</span></div><div class="jeepney-list">${railOptions.map((o,i)=>{const a=o.stops[0],b=o.stops.at(-1);return `<button type="button" class="jeepney-route rail-option" data-action="select-rail" data-index="${i}" aria-pressed="${i===0}"><span class="jeepney-route-head">🚆 ${esc(a?.name||'Station')} → ${esc(b?.name||'Station')}</span><span class="jeepney-route-step"><b>${esc(o.lines.join(' · '))}</b> · ${o.transfers} transfer${o.transfers===1?'':'s'}</span><span class="jeepney-route-step">${Math.round(o.walkMeters)} m walking including station access and interchanges</span><span class="jeepney-route-source">Select to show the mapped path on the map</span></button>`;}).join('')}</div><div id="rail-selected-detail" aria-live="polite"></div><p class="mini muted">Network review valid until ${esc(new Date(result.reviewValidUntil).toLocaleDateString('en-PH',{timeZone:'Asia/Manila'}))}. Topology is not a timetable or guarantee of service. Map © OpenStreetMap contributors.</p>`;
  drawRailOption(0);
 }catch(error){if(requestSeq===routeSeq&&currentPage==='commute')el.innerHTML=`<div class="alert">${esc(error.message||'Rail route search could not be completed.')} Try again later or check Sakay.ph.</div>`;}
}
async function findLiveRoute(automatic=false){
 const el=$('#route-info');if(!liveMap||!el)return;
 const selected=selectedOrigin();if(!selected){el.textContent='Choose a starting point before calculating a route.';return;}
 const mode=$('#trip-mode')?.value||'Transit';if(mode==='Jeepney'){await findJeepneyRoutes();return;}if(mode==='Train'||mode==='Transit'){await findRailRoutes();return;}if(!['Walking','Driving'].includes(mode)){renderTransportNote();return;}
 if(routeRequestBusy)return;
 const profile=mode==='Walking'?'foot':'driving',dest=destinationCoords(),origin={...selected.point},seq=++routeSeq;
 routeAbortController=new AbortController();routeRequestBusy=true;
 el.textContent=automatic?'Automatically calculating your journey time…':'Calculating route…';
 let movedDuringRequest=false;
 try{
  const url=`https://routing.openstreetmap.de/routed-${profile}/route/v1/${profile}/${origin.lng},${origin.lat};${dest[1]},${dest[0]}?overview=full&geometries=geojson`;
  const timeout=setTimeout(()=>routeAbortController?.abort(),12000);
  let res;try{res=await fetch(url,{signal:routeAbortController.signal});}finally{clearTimeout(timeout);}
  if(!res.ok)throw Error('Routing service unavailable');const data=await res.json();if(seq!==routeSeq||currentPage!=='commute')return;if(originMode==='gps'&&gpsPosition&&distanceMeters(origin,gpsPosition)>=250){movedDuringRequest=true;return;}
  const route=data.routes?.[0];if(!route?.geometry?.coordinates?.length)throw Error('No route returned');
  if(liveRoute)liveMap.removeLayer(liveRoute);
  liveRoute=L.polyline(route.geometry.coordinates.map(p=>[p[1],p[0]]),{color:'#208c69',weight:5,opacity:.9,className:'tt-route-line'}).addTo(liveMap);
  liveMap.fitBounds(liveRoute.getBounds(),{padding:[40,40]});const minutes=Math.max(1,Math.ceil(route.duration/60));
  lastRouteAt=Date.now();lastRouteOrigin={...origin};activeRouteEstimate={minutes,mode,campus:selectedClass()?.campus||state.settings.campus,at:Date.now()};
  if($('#trip-travel')){$('#trip-travel').value=minutes;$('#trip-travel').dataset.routeEstimate='true';}updateCommute();
  el.innerHTML=`<div class="highlight"><strong>${esc(mode)} route preview</strong><div>${(route.distance/1000).toFixed(1)} km · about ${minutes} minutes (routing estimate, not live traffic)</div><div class="mini muted">Departure time was recalculated automatically using this route's duration.</div><span class="auto-applied">✓ Applied automatically</span></div>`;
  el.dataset.routeMinutes=String(minutes);
  }catch(err){if(seq===routeSeq){el.textContent='Automatic route unavailable: '+(err.name==='AbortError'?'the request timed out or destination changed':err.message)+'. The saved estimate remains in use until a route can be calculated.';updateCommute();}}finally{if(seq===routeSeq){routeRequestBusy=false;routeAbortController=null;if(movedDuringRequest)scheduleAutoRoute(true);}}
}

// A custom, accessible AM/PM switch avoids browser-dependent native time-picker highlighting.
const timePicker = (prefix,label,h=9,m=0,period='AM') => `<fieldset class="time-picker" data-clock="${prefix}"><legend>${label}</legend><div class="time-controls"><label class="time-number">Hour<input aria-label="${label} hour" type="number" name="${prefix}-hour" min="1" max="12" value="${h}" required></label><span class="time-colon">:</span><label class="time-number">Minute<input aria-label="${label} minute" type="number" name="${prefix}-minute" min="0" max="59" value="${String(m).padStart(2,'0')}" required></label><div class="ampm-toggle" role="group" aria-label="${label} AM or PM"><button type="button" class="period-button ${period==='AM'?'active':''}" data-period="AM" data-clock="${prefix}" aria-pressed="${period==='AM'}">AM</button><button type="button" class="period-button ${period==='PM'?'active':''}" data-period="PM" data-clock="${prefix}" aria-pressed="${period==='PM'}">PM</button></div></div><input type="hidden" name="${prefix}" value="${to24Hour(h,m,period)}"></fieldset>`;
function to24Hour(hour,minute,period){const h=Number(hour)%12+(period==='PM'?12:0);return `${String(h).padStart(2,'0')}:${String(Number(minute)).padStart(2,'0')}`;}
const classForm=`<div class="field"><label for="subject-name">Subject name *</label><input id="subject-name" name="name" maxlength="80" required placeholder="e.g. Data Structures"></div><fieldset class="field weekday-picker"><legend>Repeats every week on</legend><div class="weekday-options">${days.map((day,i)=>`<label><input type="checkbox" name="weekdays" value="${i}"><span>${day.slice(0,3)}</span></label>`).join('')}</div></fieldset><div class="field"><label for="class-room">Room</label><input id="class-room" name="room" maxlength="40" placeholder="Room 401"></div><div class="time-grid">${timePicker('time','Class starts',9,0,'AM')}${timePicker('end','Class ends',10,30,'AM')}</div><div class="field"><label for="class-campus">Campus</label><select id="class-campus" name="campus">${Object.keys(campusOptions).map(c=>`<option>${esc(c)}</option>`).join('')}</select></div><div class="field"><label for="class-travel">Class-specific travel estimate (optional, minutes)</label><input id="class-travel" name="travel" type="number" min="1" max="480" placeholder="Use campus default"></div>`;
function updateHiddenTime(clock){const fs=document.querySelector(`[data-clock="${clock}"].time-picker`);if(!fs)return;const hour=Number(fs.querySelector(`[name="${clock}-hour"]`).value),minute=Number(fs.querySelector(`[name="${clock}-minute"]`).value);const period=fs.querySelector('.period-button.active')?.dataset.period||'AM';if(hour>=1&&hour<=12&&minute>=0&&minute<=59)fs.querySelector(`[name="${clock}"]`).value=to24Hour(hour,minute,period);}
$('#modal-fields').addEventListener('click',event=>{const btn=event.target.closest('.period-button');if(!btn)return;const fs=btn.closest('.time-picker');fs.querySelectorAll('.period-button').forEach(b=>{const active=b===btn;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});updateHiddenTime(btn.dataset.clock);});
$('#modal-fields').addEventListener('input',event=>{const fs=event.target.closest('.time-picker');if(fs)updateHiddenTime(fs.dataset.clock);});
function openClassModal(classId=null,defaultWeekday=null){
 const existing=classId?state.classes.find(c=>c.id===classId):null;editingClassId=existing?.id||null;
 $('#modal-title').textContent=existing?'Edit class':'Add class';$('#modal-fields').innerHTML=classForm;
 $('#modal-fields [name="campus"]').value=existing?.campus||state.settings.campus;
 const today=manilaDateParts(),selectedDays=existing?classWeekdays(existing):[Number.isInteger(defaultWeekday)?defaultWeekday:new Date(Date.UTC(today.year,today.month-1,today.day)).getUTCDay()];
 $('#modal-fields').querySelectorAll('[name="weekdays"]').forEach(box=>box.checked=selectedDays.includes(Number(box.value)));
 if(existing){$('#modal-fields [name="name"]').value=existing.name;$('#modal-fields [name="room"]').value=existing.room||'';$('#modal-fields [name="travel"]').value=existing.travel||'';for(const box of $('#modal-fields').querySelectorAll('[name="weekdays"]'))box.checked=classWeekdays(existing).includes(Number(box.value));
  for(const [prefix,value] of [['time',existing.time],['end',existing.end]]){const [h,m]=value.split(':').map(Number),hour=h%12||12,period=h>=12?'PM':'AM',set=$(`#modal-fields [name="${prefix}-hour"]`);set.value=hour;$('#modal-fields').querySelector(`[name="${prefix}-minute"]`).value=m;$('#modal-fields').querySelectorAll(`[data-clock="${prefix}"].time-picker .period-button`).forEach(b=>{const active=b.dataset.period===period;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});updateHiddenTime(prefix);}
 }
 $('#dialog').showModal();
}
$('#modal-form').addEventListener('submit',async event=>{
 event.preventDefault();const fields=Object.fromEntries(new FormData(event.target).entries());
 if(fields.end<=fields.time){toast('Class end time must be after the start time.');return;}
 const weekdays=[...new Set(new FormData(event.target).getAll('weekdays').map(Number))].sort((a,b)=>a-b);if(!weekdays.length){toast('Choose at least one class day.');return;}
 const conflict=state.classes.find(c=>c.id!==editingClassId&&classWeekdays(c).some(d=>weekdays.includes(d))&&timeMinutes(fields.time)<timeMinutes(c.end)&&timeMinutes(fields.end)>timeMinutes(c.time));
 if(conflict&&!confirm(`This overlaps ${conflict.name} on ${classWeekdays(conflict).filter(d=>weekdays.includes(d)).map(d=>days[d]).join(', ')}. Save the class anyway?`))return;
 const override=fields.travel===''?null:Number(fields.travel);if(override!==null&&(!Number.isFinite(override)||override<1||override>480)){toast('Class travel estimate must be between 1 and 480 minutes.');return;}
 const updated={...(state.classes.find(c=>c.id===editingClassId)||{}),id:editingClassId||uid(),name:fields.name.trim(),day:weekdays[0],weekdays,room:fields.room,time:fields.time,end:fields.end,campus:fields.campus,travel:override};
 if(editingClassId)state.classes=state.classes.map(c=>c.id===editingClassId?updated:c);else state.classes.push(updated);
 const wasEditing=!!editingClassId;editingClassId=null;
 $('#dialog').close();render();
 try{await saveToCloud(wasEditing?undefined:'class_added');toast(wasEditing?'Class updated online ✓':'Class saved online ✓');}catch(err){toast('Cloud save failed: '+(err.message||err));}
});
$('#close-modal').onclick=$('#cancel-modal').onclick=()=>$('#dialog').close();
$('#quick-add').onclick=openClassModal;
document.querySelectorAll('#nav button').forEach(button=>button.addEventListener('click',()=>navigate(button.dataset.page)));
$('#content').addEventListener('click',event=>{const button=event.target.closest('[data-theme-choice]');if(!button)return;const form=button.closest('form');if(!form)return;form.querySelector('input[name=theme]').value=button.dataset.themeChoice;form.querySelectorAll('[data-theme-choice]').forEach(b=>{const active=b===button;b.classList.toggle('selected',active);b.setAttribute('aria-checked',String(active));});applyTheme(button.dataset.themeChoice);});
$('#content').addEventListener('submit',async event=>{
 if(event.target.id!=='settings-form')return;
 event.preventDefault();const v=Object.fromEntries(new FormData(event.target).entries());
 const campusTravel={...(state.settings.campusTravel||{})};for(const campus of Object.keys(campusOptions)){const raw=v[`campusTravel:${campus}`];if(raw==='')delete campusTravel[campus];else{const minutes=Number(raw);if(!Number.isFinite(minutes)||minutes<1||minutes>480){toast(`Enter a valid travel time for ${campus}, or leave it blank.`);return;}campusTravel[campus]=minutes;}}
 const settings={...state.settings,name:v.name.trim()||'Tamaraw',campus:v.campus,mode:v.mode,travel:Number(v.travel),campusTravel,prep:Number(v.prep),buffer:Number(v.buffer),theme:themeNames[v.theme]?v.theme:'forest'};
 if(!Number.isFinite(settings.travel)||settings.travel<1||settings.travel>480||settings.prep<0||settings.prep>240||settings.buffer<0||settings.buffer>120){toast('Please enter valid settings.');return;}
 const changed=Object.keys(settings).some(k=>settings[k]!==state.settings[k]);state.settings=settings;applyTheme(settings.theme);navigate('settings');
 if(!changed){toast('No settings changed');return;}
 try{await saveToCloud('settings_saved');toast('Settings saved online ✓');}catch(err){toast('Save failed: '+(err.message||err));}
});
$('#content').addEventListener('input',event=>{if(event.target.id==='rail-directory-search'){const target=$('#transit-reference-results'),pos=event.target.selectionStart;renderRailDirectory(target).then(()=>{const input=$('#rail-directory-search');input?.focus();input?.setSelectionRange(pos,pos);});}if(event.target.id==='historical-search'){const target=$('#transit-reference-results'),pos=event.target.selectionStart;renderHistoricalDirectory(target).then(()=>{const input=$('#historical-search');input?.focus();input?.setSelectionRange(pos,pos);});}});
$('#content').addEventListener('click',async event=>{
 const button=event.target.closest('button[data-action]');if(!button)return;
 const action=button.dataset.action;
 if(action==='go-home'){navigate('home');return;}
 if(action==='enable-alarm-notifications'){await enableAlarmNotifications();return;}
 if(action==='disable-alarm-notifications'){alarmNotificationsEnabled=false;try{localStorage.setItem('tamaraw_alarm_notifications','false');}catch(_){}render();toast('Leave-time notifications are off.');return;}
 if(action==='show-install-guide'){await installAppOrShowGuide();return;}
 if(action==='notification-help'){toast('Open your browser or device settings, find Tamaraw Time under Site settings or Notifications, and allow alerts.');return;}
 if(action==='add-class'){openClassModal(null,currentPage==='schedule'?new Date(`${scheduleSelectedKey}T00:00:00Z`).getUTCDay():undefined);return;}
 if(action==='edit-class'){openClassModal(button.dataset.id);return;}
 if(action==='select-date'){scheduleSelectedKey=button.dataset.date;const d=new Date(`${scheduleSelectedKey}T00:00:00Z`);scheduleMonth=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1));render();return;}
 if(action==='month-prev'||action==='month-next'){if(!scheduleMonth)scheduleMonth=new Date();scheduleMonth=new Date(Date.UTC(scheduleMonth.getUTCFullYear(),scheduleMonth.getUTCMonth()+(action==='month-next'?1:-1),1));render();return;}
 if(action==='go-commute'){navigate('commute');return;}
 if(action==='go-schedule'){navigate('schedule');return;}
 if(action==='tutorial'){showTutorial();return;}
 if(action==='change-password'){if(typeof CloudStore.db?.auth?.updateUser!=='function'){toast('Account security is unavailable in preview mode.');return;}openPasswordDialog('change');return;}
 if(action==='show-rail-directory'){const target=$('#transit-reference-results');if($('#rail-directory-search')){target.innerHTML='';return;}await renderRailDirectory(target);return;}
 if(action==='show-historical'){const target=$('#transit-reference-results');if($('#historical-search')){target.innerHTML='';return;}await renderHistoricalDirectory(target);return;}
 if(action==='del-class'){
  if(!confirm('Remove this class?'))return;
  state.classes=state.classes.filter(c=>c.id!==button.dataset.id);render();
  try{await saveToCloud('class_deleted');toast('Class removed online ✓');}catch(err){toast('Remove failed: '+(err.message||err));}return;
 }
 if(action==='save-commute'){
  const val=id=>Number($('#'+id)?.value);
  const revised={travel:val('trip-travel'),buffer:val('trip-buffer'),prep:val('trip-prep'),mode:$('#trip-mode').value},campus=selectedClass()?.campus||state.settings.campus,campusTravel={...(state.settings.campusTravel||{}),[campus]:revised.travel};
  if(!Number.isFinite(revised.travel)||revised.travel<1||revised.travel>480||!Number.isFinite(revised.buffer)||revised.buffer<0||revised.buffer>120||!Number.isFinite(revised.prep)||revised.prep<0||revised.prep>240){toast('Please enter valid travel times.');return;}
  const changed=Object.entries(revised).some(([k,v])=>v!==state.settings[k])||state.settings.campusTravel?.[campus]!==revised.travel;
  Object.assign(state.settings,revised,{campusTravel});updateCommute();
  if(!changed){toast('No commute settings changed');return;}
  try{await saveToCloud('commute_saved');toast('Commute saved online ✓');}catch(err){toast('Save failed: '+(err.message||err));}return;
 }
 if(action==='location'){
  const output=$('#gps-output');if(!navigator.geolocation){output.textContent='Geolocation is unavailable in this browser.';return;}
  stopGps();output.textContent='Requesting GPS permission…';
  gpsWatchId=navigator.geolocation.watchPosition(position=>{
   gpsPosition={lat:position.coords.latitude,lng:position.coords.longitude};
   if(currentPage==='commute'){$('#gps-output').innerHTML='<span class="gps-live-dot" aria-hidden="true"></span>Tracking live · accuracy approximately '+Math.round(position.coords.accuracy)+' m';updateGpsMarker();updateOriginStatus();scheduleAutoRoute();}
  },error=>{if(currentPage==='commute')$('#gps-output').textContent=error.code===1?'Location permission denied. Allow location access in browser settings, then try again.':error.code===2?'Your device could not determine a location. Check GPS and network, then retry.':error.code===3?'GPS took too long to respond. Move to an open area and retry.':'GPS unavailable: '+error.message;},{enableHighAccuracy:true,maximumAge:5000,timeout:25000});
  await logActivity('gps_checked');return;
 }
 if(action==='stop-location'){stopGps();return;}
 if(action==='show-map'){await findLiveRoute(false);await logActivity('maps_opened');return;}
 if(action==='pick-map-origin'){originMode='map';originPickerActive=true;$('#origin-mode').value='map';invalidateOriginRoute();updateOriginStatus();toast('Tap the map to choose your starting point.');return;}
 if(action==='select-jeepney'){selectJeepneyRoute(Number(button.dataset.index));return;}
 if(action==='select-rail'){drawRailOption(Number(button.dataset.index));return;}
 if(action==='use-route-eta'){const minutes=Number($('#route-info')?.dataset.routeMinutes);if(Number.isFinite(minutes)&&minutes>0){$('#trip-travel').value=minutes;updateCommute();toast('Route estimate applied. Save commute settings to keep it.');}return;}
 if(action==='refresh-cloud'){
  try{await refreshCloud();toast('Cloud data refreshed ✓');}catch(err){toast('Refresh failed: '+(err.message||err));}return;
 }
 if(action==='export'){
  const blob=new Blob([JSON.stringify({classes:state.classes,settings:state.settings,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='tamaraw-time-schedule.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);return;
 }
 if(action==='reset'){
  if(!confirm('Clear your saved classes and commute preferences? Study activity logs remain stored for the research team.'))return;
  const old=snapshot();state.classes=[];state.settings=structuredClone(defaults.settings);applyTheme(state.settings.theme);
  try{await saveToCloud();navigate('settings');toast('Schedule reset online ✓');}
  catch(err){state.classes=old.classes;state.settings=old.settings;render();toast('Reset failed: '+(err.message||err));}
 }
});
$('#tutorial-next').addEventListener('click',()=>{if(tutorialIndex===tutorialSteps.length-1){finishTutorial();navigate('schedule');}else{tutorialIndex++;drawTutorial();}});
$('#tutorial-prev').addEventListener('click',()=>{if(tutorialIndex>0){tutorialIndex--;drawTutorial();}});
$('#tutorial-close').addEventListener('click',finishTutorial);
$('#tutorial-skip').addEventListener('click',finishTutorial);
$('#tutorial-dialog').addEventListener('cancel',()=>{state.onboarding.finished=true;saveToCloud();});
$('#tutorial-dialog').addEventListener('close',()=>{if(state.onboarding.finished)maybePromptInstallGuide();});
function authMode(mode){
 const signup=mode==='signup';$('#auth-form').dataset.mode=mode;
 $('#auth-submit').textContent=signup?'Create account':'Sign in';
 $('#auth-heading').textContent=signup?'Create your Tamaraw Time account':'Welcome back, Tamaraw!';
 $('#auth-mode-toggle').textContent=signup?'Already have an account? Sign in':'New here? Create an account';
 $('#auth-consent').hidden=!signup;$('#study-consent').required=signup;if($('#auth-options'))$('#auth-options').hidden=signup;
 $('#auth-password').autocomplete=signup?'new-password':'current-password';$('#auth-message').textContent='';
}
function openPasswordDialog(mode){
 let dialog=$('#account-dialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='account-dialog';dialog.setAttribute('aria-labelledby','account-dialog-title');document.body.append(dialog);}
 const recovery=mode==='recovery',request=mode==='request';
 const title=request?'Reset your password':recovery?'Choose a new password':'Change your password';
 const fields=recovery?'<div class="field"><label for="new-password">New password</label><input id="new-password" type="password" minlength="6" required autocomplete="new-password"></div><div class="field"><label for="confirm-password">Confirm new password</label><input id="confirm-password" type="password" minlength="6" required autocomplete="new-password"></div>':request?'<div class="field"><label for="recovery-email">Student email</label><input id="recovery-email" type="email" required autocomplete="email"></div>':'<div class="field"><label for="current-password">Current password</label><input id="current-password" type="password" required autocomplete="current-password"></div><div class="field"><label for="new-password">New password (at least 6 characters)</label><input id="new-password" type="password" minlength="6" required autocomplete="new-password"></div><div class="field"><label for="confirm-password">Confirm new password</label><input id="confirm-password" type="password" minlength="6" required autocomplete="new-password"></div>';
 dialog.innerHTML=`<form id="account-dialog-form"><div class="modal-head"><h2 id="account-dialog-title">${title}</h2>${recovery?'':'<button type="button" id="account-dialog-close" class="iconbutton" aria-label="Close">×</button>'}</div><div id="account-dialog-fields">${fields}</div><p id="account-dialog-message" role="status" aria-live="polite"></p><div class="actions">${recovery?'':'<button type="button" class="secondary" id="account-dialog-cancel">Cancel</button>'}<button type="submit" class="primary" id="account-dialog-submit">${request?'Send recovery email':'Save password'}</button></div></form>`;
 const form=$('#account-dialog-form'),message=$('#account-dialog-message'),submit=$('#account-dialog-submit');
 const close=()=>{if(dialog.open)dialog.close();};$('#account-dialog-close')?.addEventListener('click',close);$('#account-dialog-cancel')?.addEventListener('click',close);
 form.addEventListener('submit',async event=>{event.preventDefault();message.textContent='';submit.disabled=true;
  try{
   if(request){const email=$('#recovery-email').value.trim();const {error}=await CloudStore.db.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname+'?recovery=1'});if(error)throw error;message.textContent='If an account matches that email, a password reset link has been sent.';submit.hidden=true;return;}
   const password=$('#new-password').value,confirmation=$('#confirm-password').value;if(password.length<6)throw Error('Use at least 6 characters.');if(password!==confirmation)throw Error('The new passwords do not match.');
   if(!recovery){const current=$('#current-password').value,email=CloudStore.getUser()?.email;if(!email)throw Error('Sign in again before changing your password.');const signed=await CloudStore.db.auth.signInWithPassword({email,password:current});if(signed.error)throw signed.error;}
   const {error}=await CloudStore.db.auth.updateUser({password});if(error)throw error;
   if(recovery){recoveryPending=false;close();history.replaceState({},document.title,location.pathname);await CloudStore.db.auth.signOut();showAuth('Password updated. Sign in with your new password.');}
   else{close();toast('Password changed successfully.');}
  }catch(error){message.textContent=error.message||'The password request could not be completed.';}finally{submit.disabled=false;}
 });
 if(request)$('#recovery-email').value=$('#auth-email').value.trim();
 if(dialog.open)dialog.close();dialog.showModal();$('#'+(recovery?'new-password':request?'recovery-email':'current-password')).focus();
}
function showAuth(message=''){
 loadedUser=null;CloudStore.setUser(null);$('#app-layout').hidden=true;$('#auth-screen').hidden=false;$('#account-email').textContent='';
 $('#signout-button').textContent='Sign out';if($('#device-mode-button'))$('#device-mode-button').hidden=false;
 if($('#account-dialog')?.open)$('#account-dialog').close();
 $('#auth-form').hidden=false;$('#auth-mode-toggle').hidden=false;authMode('login');
 if($('#tutorial-dialog').open)$('#tutorial-dialog').close();
 $('#auth-message').textContent=message;
 if(!CloudStore.configured){$('#auth-submit').disabled=true;$('#auth-message').textContent='Online database not connected. Ask the project owner to configure cloud-config.js and install schema.sql in Supabase.';}
}
document.addEventListener('visibilitychange',()=>{if(document.hidden&&gpsWatchId!==null){stopGps();cancelRoadRoute();const output=$('#gps-output');if(output)output.textContent='GPS stopped while the page was in the background. Start tracking again when you return.';}});
if($('#remember-me')){$('#remember-me').checked=CloudStore.getRemember?.()??true;$('#remember-me').addEventListener('change',event=>CloudStore.setRemember?.(event.target.checked));}
$('#forgot-password')?.addEventListener('click',()=>openPasswordDialog('request'));
$('#device-mode-button')?.addEventListener('click',()=>{let p={};try{p=JSON.parse(localStorage.getItem('tamaraw_local_planner')||'{}');}catch(_){toast('Saved device data could not be read.');return;}localMode=true;loadedUser='local-device';state={classes:Array.isArray(p.classes)?p.classes:[],tasks:Array.isArray(p.tasks)?p.tasks:[],settings:{...defaults.settings,...(p.settings||{})},onboarding:{finished:!!p?.onboarding?.finished}};applyTheme(state.settings.theme);$('#account-email').textContent='This device';$('#signout-button').textContent='Exit planner';$('#auth-screen').hidden=true;$('#app-layout').hidden=false;navigate('home');if(!state.onboarding.finished)setTimeout(showTutorial,120);else maybePromptInstallGuide();});
function isRecoveryCallback(){return new URLSearchParams(location.search).has('recovery')||new URLSearchParams(location.hash.slice(1)).get('type')==='recovery';}
function beginRecovery(){recoveryPending=true;showAuth('Choose a new password for your Tamaraw Time account.');$('#auth-form').hidden=true;$('#auth-mode-toggle').hidden=true;if($('#forgot-password'))$('#forgot-password').hidden=true;if($('#device-mode-button'))$('#device-mode-button').hidden=true;openPasswordDialog('recovery');}
async function enterApp(user){
 if(!user||!CloudStore.configured||loadedUser===user.id)return;
 localMode=false;
 const ticket=++authCounter;CloudStore.setUser(user);$('#auth-message').textContent='Loading your saved schedule…';
 try{
  const data=await CloudStore.load();if(ticket!==authCounter)return;
  const p=data.payload||{};
  state={classes:Array.isArray(p.classes)?p.classes:[],tasks:Array.isArray(p.tasks)?p.tasks:[],settings:{...defaults.settings,...(p.settings||{})},onboarding:{finished:!!p?.onboarding?.finished}};
  applyTheme(state.settings.theme);activeRouteEstimate=null;
  loadedUser=user.id;stopGps();gpsPosition=null;mapOriginText='';shownMapSignature='';
  $('#account-email').textContent=user.email||'Student account';$('#auth-screen').hidden=true;$('#app-layout').hidden=false;
  navigate('home');if(!state.onboarding.finished)setTimeout(showTutorial,120);else maybePromptInstallGuide();
 }catch(err){showAuth('Could not load cloud data: '+(err.message||err)+'. Check your Supabase setup.');}
}
async function refreshCloud(){
 if(localMode){const p=JSON.parse(localStorage.getItem('tamaraw_local_planner')||'{}');state={classes:Array.isArray(p.classes)?p.classes:[],tasks:Array.isArray(p.tasks)?p.tasks:[],settings:{...defaults.settings,...(p.settings||{})},onboarding:{finished:!!p?.onboarding?.finished}};applyTheme(state.settings.theme);navigate(currentPage);return;}
 if(!CloudStore.getUser())return;
 await writeQueue.catch(()=>{});const data=await CloudStore.load();const p=data.payload||{};
 state={classes:Array.isArray(p.classes)?p.classes:[],tasks:Array.isArray(p.tasks)?p.tasks:[],settings:{...defaults.settings,...(p.settings||{})},onboarding:{finished:!!p?.onboarding?.finished}};
  applyTheme(state.settings.theme);activeRouteEstimate=null;
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
 if(localMode){localMode=false;loadedUser=null;stopGps();showAuth('Device planner closed. Your saved device schedule remains on this browser.');return;}
 await writeQueue.catch(()=>{});const {error}=await CloudStore.db.auth.signOut();
 if(error){toast('Sign out failed: '+error.message);return;}
 stopGps();++authCounter;showAuth('You are signed out. Your classes are saved online.');
});
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();deferredInstallPrompt=event;});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;if(currentPage==='home'||currentPage==='settings')render();});
async function boot(){
 formatClock();setInterval(formatClock,1000);authMode('login');void ensureServiceWorker();
 if(!CloudStore.configured){showAuth();return;}
 CloudStore.db.auth.onAuthStateChange((event,session)=>{
  if(event==='PASSWORD_RECOVERY'){beginRecovery();}
  else if(event==='SIGNED_OUT'){++authCounter;showAuth('Signed out.');}
  else if(event==='SIGNED_IN'&&session?.user&&!recoveryPending&&!isRecoveryCallback())setTimeout(()=>enterApp(session.user),0);
 });
 const {data,error}=await CloudStore.db.auth.getSession();
 if(error){showAuth(error.message);return;}
 if(isRecoveryCallback()){beginRecovery();return;}
 if(data.session?.user)await enterApp(data.session.user);else showAuth();
}
boot();
