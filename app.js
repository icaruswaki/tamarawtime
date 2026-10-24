'use strict';
const $=q=>document.querySelector(q);
const uid=()=>globalThis.crypto?.randomUUID?.() || 'tt-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const days=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const defaults={classes:[],tasks:[],settings:{name:'Tamaraw',campus:'FEU Tech',travel:55,prep:45,buffer:15,mode:'Transit'}};
let state={...structuredClone(defaults),tracker:{events:[]},onboarding:{finished:false},feedback:null};
let page='home', loadedFor=null, authCounter=0;
let writeQueue=Promise.resolve();
function payload(){return {classes:structuredClone(state.classes),tasks:structuredClone(state.tasks),settings:structuredClone(state.settings),onboarding:structuredClone(state.onboarding)}}
function persist(eventType=null){
 const snapshot=payload();
 const next=writeQueue.catch(()=>{}).then(async()=>{
  await CloudStore.savePayload(snapshot);
  if(eventType){
   const event=await CloudStore.logEvent(eventType);
   state.tracker.events.push(event);
   if(page==='progress'||page==='home')render();
  }
 });
 writeQueue=next;
 next.catch(err=>toast('Cloud save failed: '+(err.message||err)));
 return next;
}
const save=()=>persist();
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=(s)=>s?new Date(s+'T23:59:59'):null;
const fmtDate=d=>d.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'});
const ampm=t=>{const [h,m]=String(t).split(':').map(Number);return `${(h%12)||12}:${String(m).padStart(2,'0')} ${h>=12?'PM':'AM'}`};
const asMinutes=t=>{const [h,m]=t.split(':').map(Number);return h*60+m};
const minutesToTime=t=>{const n=(t%1440+1440)%1440;return ampm(`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`)};
const nextDate=c=>{let now=new Date(),delta=(days.indexOf(c.day)>=0?days.indexOf(c.day):Number(c.day))-now.getDay();if(delta<0)delta+=7;let d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+delta);let [h,m]=c.time.split(':').map(Number);d.setHours(h,m,0,0);if(d<=now)d.setDate(d.getDate()+7);return d};
const upcoming=()=>state.classes.map(c=>({...c,when:nextDate(c)})).sort((a,b)=>a.when-b.when);
const due=()=>state.tasks.filter(t=>!t.done).sort((a,b)=>(a.deadline||'9999').localeCompare(b.deadline||'9999'));
const resultFor=(c)=>{let st=asMinutes(c.time),s=state.settings;return{departure:minutesToTime(st-Number(s.travel)-Number(s.buffer)),wake:minutesToTime(st-Number(s.travel)-Number(s.buffer)-Number(s.prep)),arrival:minutesToTime(st-Number(s.buffer))}};
const status=t=>{if(t.done)return ['Completed','gray'];if(!t.deadline)return ['No deadline','gray'];let left=Math.ceil((stamp(t.deadline)-new Date())/86400000);return left<=0?['Due today / overdue','urgent']:left<=2?['Due soon','urgent']:[fmtDate(stamp(t.deadline)),'']};
// A student day is counted only after a meaningful action is logged on the
// cloud database. The backend supplies action timestamps (Asia/Manila dates).
const validEvents=new Set(['task_added','task_completed','task_reopened','task_deleted','class_added','class_deleted','commute_saved','settings_saved','maps_opened','gps_checked']);
const actionNames={task_added:'Added a task',task_completed:'Completed a task',task_reopened:'Reopened a task',task_deleted:'Deleted a task',class_added:'Added a class',class_deleted:'Deleted a class',commute_saved:'Updated commute plan',settings_saved:'Updated preferences',maps_opened:'Opened route in Maps',gps_checked:'Checked location with GPS'};
function track(type){if(!validEvents.has(type))return Promise.resolve();return persist(type)}
const activityDays=()=>[...new Set(state.tracker.events.filter(e=>validEvents.has(e.type)&&/^\d{4}-\d{2}-\d{2}$/.test(e.day)).map(e=>e.day))].sort();
const eligibleForFeedback=()=>activityDays().length>=3;
function downloadText(filename,content,mime){const url=URL.createObjectURL(new Blob([content],{type:mime}));const link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),3000)}
function exportProgressCSV(){const quote=x=>'"'+String(x??'').replace(/"/g,'""')+'"';const rows=[['Date (Philippines)','Time (Philippines)','Activity','Description']];for(const e of state.tracker.events){if(!validEvents.has(e.type))continue;const t=new Date(e.at);rows.push([e.day,Number.isNaN(t.getTime())?'':t.toLocaleTimeString('en-PH',{timeZone:'Asia/Manila'}),e.type,actionNames[e.type]||e.type])}const content=rows.map(r=>r.map(quote).join(',')).join('\r\n');downloadText('tamaraw-time-activity.csv',content,'text/csv;charset=utf-8')}
function progressPanel(){
 const ds=activityDays(),count=ds.length,n=Math.min(count,3),entries=[...state.tracker.events].filter(e=>validEvents.has(e.type)).reverse(),qualified=eligibleForFeedback();
 const marks=Array.from({length:3},(_,i)=>`<div class="day-step ${i<n?'checked':''}"><div class="day-icon">${i<n?'✓':i+1}</div><b>Active day ${i+1}</b><small>${ds[i]?esc(fmtDate(new Date(ds[i]+'T12:00:00'))):'Not recorded yet'}</small></div>`).join('');
 const activityRows=entries.slice(0,15).map(e=>`<div class="item"><div><b>${esc(actionNames[e.type]||e.type)}</b><small>${esc(fmtDate(new Date(e.day+'T12:00:00')))} · ${esc(new Date(e.at).toLocaleTimeString('en-PH',{timeZone:'Asia/Manila',hour:'numeric',minute:'2-digit'}))}</small></div>${badge('Logged')}</div>`).join('');
 const f=state.feedback||{};
 const feedback=qualified?`<div class="card" id="feedback-card"><div class="section-head" style="margin:0 0 10px"><h2>3-day app feedback</h2>${state.feedback?badge('Saved'):badge('Ready')}</div><p class="muted mini">For students who have actively used Tamaraw Time on at least 3 different dates. Your feedback is securely saved to your student account online.</p><form id="feedback-form"><div class="field"><label for="feedback-code">Respondent code (optional; avoid your full name)</label><input id="feedback-code" name="code" maxlength="30" placeholder="e.g. STUDENT-01" value="${esc(f.code||'')}"></div><div class="formgrid"><div class="field"><label for="feedback-overall">Overall experience *</label><select required id="feedback-overall" name="overall"><option value="">Select 1–5</option>${[1,2,3,4,5].map(i=>`<option value="${i}" ${String(f.overall)===String(i)?'selected':''}>${i} / 5</option>`).join('')}</select></div><div class="field"><label for="feedback-ease">Ease of use *</label><select required id="feedback-ease" name="ease"><option value="">Select 1–5</option>${[1,2,3,4,5].map(i=>`<option value="${i}" ${String(f.ease)===String(i)?'selected':''}>${i} / 5</option>`).join('')}</select></div></div><div class="field"><label for="feedback-feature">Most useful feature *</label><select required id="feedback-feature" name="feature"><option value="">Choose one</option>${['Class schedule','Tasks and deadlines','Commute planner','Progress tracker'].map(s=>`<option ${f.feature===s?'selected':''}>${esc(s)}</option>`).join('')}</select></div><div class="field"><label for="feedback-comments">What should we improve? *</label><textarea required name="comments" id="feedback-comments" maxlength="1000" placeholder="Tell us which features you tried and what could work better.">${esc(f.comments||'')}</textarea></div><button type="submit" class="primary">${state.feedback?'Update feedback':'Save my feedback'}</button></form>${state.feedback?`<p class="mini muted">Last saved: ${esc(new Date(state.feedback.savedAt).toLocaleString('en-PH'))}. Your answers are stored in the study database.</p>`:''}</div>`:
 `<div class="card"><h2>3-day app feedback</h2><p class="muted">Feedback opens after 3 different active days. You need <b>${3-n} more active ${3-n===1?'day':'days'}</b>. You can use the app on any three dates—they do not need to be consecutive.</p><p class="mini muted">To count a day, do something in the app such as adding/completing a task, adding a class, changing your commute, or opening Maps.</p></div>`;
 return `<div class="card progress-hero"><div class="progress-hero-head"><div><span class="mini progress-kicker">PILOT TESTING · CLOUD RECORD</span><h2>Your 3-day activity journey</h2><p>${qualified?'You have recorded activity on at least three different days. Your feedback form is available.':'Use the planner on 3 different calendar days before answering the class feedback survey.'}</p></div>${badge(qualified?'3 active days reached':`${n} of 3 days`)} </div><div class="progress-bar" role="progressbar" aria-label="Active days progress" aria-valuemin="0" aria-valuemax="3" aria-valuenow="${n}"><div style="width:${n*100/3}%"></div></div><div class="day-steps">${marks}</div><p class="mini progress-footnote">An active day requires an action—not just opening the website. Days use Philippine calendar dates from server timestamps. Logs help document activity but cannot prove that a real person completed each action.</p></div><div class="grid three" style="margin-top:19px"><div class="card stat"><div class="label">ACTIVE DAYS</div><div class="value">${count}</div><div class="note">Distinct dates with app actions</div></div><div class="card stat"><div class="label">ACTIONS LOGGED</div><div class="value">${entries.length}</div><div class="note">Since tracking was added</div></div><div class="card stat"><div class="label">TASKS COMPLETED</div><div class="value">${state.tasks.filter(t=>t.done).length}</div><div class="note">Current task list</div></div></div><div class="grid two" style="margin-top:19px"><div class="card"><div class="section-head" style="margin:0 0 12px"><h2>Recent activity</h2></div>${activityRows||'<div class="empty">No actions recorded yet. Add or complete a task to get started!</div>'}<div class="progress-download"><button class="secondary" data-action="export-progress">Export activity (CSV)</button><button class="secondary" data-action="export">Export full record (JSON)</button></div></div>${feedback}</div><div class="alert" style="margin-top:16px">Research note: Only include respondents who actually used the app. Activity is saved in the research database under the signed-in account; records are useful supporting evidence but do not guarantee authentic usage. New tracking starts with this cloud version.</div>`;
}
const tutorialSteps=[
 {icon:'🐃',title:'Welcome to Tamaraw Time!',body:'Your campus companion helps you manage classes, assignments and the time you need to leave for school.',tip:'This short tutorial appears on your first visit. You can replay it anytime from Settings.'},
 {icon:'▦',title:'1. Add your class schedule',body:'Open Class Schedule and enter the subject, day, class hours and campus. The Dashboard will show your next class.',tip:'Add your own real classes to start building your schedule.'},
 {icon:'✓',title:'2. Organize your school tasks',body:'In Tasks & Deadlines, create assignments with due dates and mark them completed. The dashboard updates as you finish.',tip:'Adding or completing tasks also records an active-use event for today.'},
 {icon:'➤',title:'3. Plan when to leave',body:'Set your travel time, prep minutes and arrival buffer in Commute Planner, then open Google Maps for route guidance.',tip:'Tamaraw Time uses your manually entered travel estimate, not live traffic.'},
 {icon:'▥',title:'4. Check progress and give feedback',body:'Open My Progress to see activity from different days. After actions on 3 separate dates, the pilot feedback form becomes available.',tip:'Your account keeps the records in the cloud, and the project team can review research results in the database.'}
];
let tutorialIndex=0;
function renderTutorial(){const s=tutorialSteps[tutorialIndex];$('#tutorial-step').innerHTML=`<div class="tutorial-illustration">${s.icon}</div><h2 id="tutorial-title">${esc(s.title)}</h2><p>${esc(s.body)}</p><div class="tutorial-tip">${esc(s.tip)}</div>`;$('#tutorial-dots').innerHTML=tutorialSteps.map((_,i)=>`<span class="${i===tutorialIndex?'active':''}" aria-hidden="true"></span>`).join('');$('#tutorial-count').textContent=`${tutorialIndex+1} / ${tutorialSteps.length}`;$('#tutorial-prev').disabled=tutorialIndex===0;$('#tutorial-next').textContent=tutorialIndex===tutorialSteps.length-1?'Start using app ✓':'Next →'}
function finishTutorial(){state.onboarding.finished=true;save();$('#tutorial-dialog').close()}
function showTutorial(){tutorialIndex=0;renderTutorial();if(!$('#tutorial-dialog').open)$('#tutorial-dialog').showModal()}
const badge=(s,kind='')=>`<span class="badge ${kind}">${esc(s)}</span>`;
const taskRow=t=>`<div class="item"><label class="checkline"><input data-action="toggle" data-id="${esc(t.id)}" type="checkbox" ${t.done?'checked':''}><div class="${t.done?'done':''}"><b>${esc(t.title)}</b><small>${esc(t.subject||'General')} · ${t.deadline?fmtDate(stamp(t.deadline)):'No due date'}</small></div></label><div class="actions-inline">${badge(t.priority,t.priority==='High'?'urgent':'gray')}<button class="iconbutton" data-action="del-task" data-id="${esc(t.id)}" title="Delete task">×</button></div></div>`;
const clsRow=c=>`<div class="item"><div><b>${esc(c.name)}</b><small>${esc(days[Number(c.day)])} · ${ampm(c.time)}–${ampm(c.end)} · ${esc(c.room||'No room')}</small></div><div class="actions-inline">${badge(c.campus||state.settings.campus)}<button class="iconbutton" data-action="del-class" data-id="${esc(c.id)}" title="Delete class">×</button></div></div>`;
function navigate(p){page=p;document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===p));const titles={home:['Good day, '+state.settings.name+'! 👋','Stay ahead of classes, commutes, and deadlines.'],schedule:['Class Schedule','Plan your week, one class at a time.'],tasks:['Tasks & Deadlines','Small steps. Big progress.'],commute:['Commute Planner','Know when to leave and when to wake up.'],progress:['My Progress','Track your app activities and 3-day pilot feedback.'],settings:['Your Settings','Personalize your daily routine.']};$('#page-title').textContent=titles[p][0];$('#page-subtitle').textContent=titles[p][1];$('#quick-add').hidden=p==='settings'||p==='progress';render()}
function render(){let html='';const next=upcoming()[0],open=due(),complete=state.tasks.filter(t=>t.done).length;
if(page==='home'){
let r=next?resultFor(next):null;
html=`<div class="grid three"><div class="card stat accent"><div class="label">NEXT CLASS</div><div class="value" style="font-size:25px">${next?esc(next.name):'No classes'}</div><div class="note">${next?esc(days[Number(next.day)])+' · '+ampm(next.time):'Add a class to get started'}</div></div><div class="card stat"><div class="label">PENDING TASKS</div><div class="value">${open.length}</div><div class="note">${complete} completed</div></div><div class="card stat"><div class="label">COMMUTE ESTIMATE</div><div class="value">${state.settings.travel}<span style="font-size:17px"> min</span></div><div class="note">${esc(state.settings.mode)} · editable in settings</div></div></div><div class="section-head"><h2>Smart departure assistant</h2></div><div class="hero"><div><small>${next?'NEXT DEPARTURE · '+esc(days[Number(next.day)]):'READY WHEN YOU ARE'}</small><h2>${next?'Leave by '+r.departure:'Add a class to plan your departure'}</h2><small>${next?'Wake up '+r.wake+' · Expected arrival '+r.arrival:'Receive personalized commute guidance'}</small></div><button class="primary" data-action="go-commute">Plan my route →</button></div><div class="grid two" style="margin-top:21px"><div class="card"><div class="section-head" style="margin:0 0 8px"><h2>Upcoming classes</h2><button class="linkbtn" data-action="go-schedule">View all →</button></div>${upcoming().slice(0,3).map(clsRow).join('')||'<div class="empty">No classes yet</div>'}</div><div class="card"><div class="section-head" style="margin:0 0 8px"><h2>To-do list</h2><button class="linkbtn" data-action="go-tasks">View all →</button></div>${open.slice(0,4).map(taskRow).join('')||'<div class="empty">All caught up!</div>'}</div></div>`;
}else if(page==='schedule'){
html=`<div class="section-head"><h2>Weekly classes</h2><button class="primary" data-action="add-class">+ Add class</button></div><div class="card">${state.classes.length? [...state.classes].sort((a,b)=>Number(a.day)-Number(b.day)||a.time.localeCompare(b.time)).map(clsRow).join(''):'<div class="empty">No classes. Add your first subject!</div>'}</div><div class="alert" style="margin-top:18px">Class reminders use the times you enter. The MVP does not sync automatically with FEU school systems.</div>`;
}else if(page==='tasks'){
html=`<div class="section-head"><h2>Manage assignments and deadlines</h2><button class="primary" data-action="add-task">+ New task</button></div><div class="grid three" style="margin-bottom:19px"><div class="card stat"><div class="label">TOTAL TASKS</div><div class="value">${state.tasks.length}</div></div><div class="card stat"><div class="label">IN PROGRESS</div><div class="value">${open.length}</div></div><div class="card stat"><div class="label">COMPLETED</div><div class="value">${complete}</div></div></div><div class="card">${state.tasks.length?([...state.tasks].sort((a,b)=>Number(a.done)-Number(b.done))).map(taskRow).join(''):'<div class="empty">No tasks yet. Add one to begin.</div>'}</div>`;
}else if(page==='commute'){
const opts=upcoming().map(c=>`<option value="${esc(c.id)}">${esc(c.name)} — ${esc(days[Number(c.day)])} ${ampm(c.time)}</option>`).join('');
html=`<div class="grid two"><div class="card"><h2>Plan your next trip</h2><div class="field"><label for="class-select">Choose a class</label><select id="class-select">${opts||'<option value="">No scheduled classes</option>'}</select></div><div class="field"><label>Destination campus</label><input value="${esc(state.settings.campus)}" disabled></div><div class="field"><label for="trip-mode">Travel mode</label><select id="trip-mode"><option value="Transit" ${state.settings.mode==='Transit'?'selected':''}>Public transit</option><option value="Driving" ${state.settings.mode==='Driving'?'selected':''}>Driving</option><option value="Walking" ${state.settings.mode==='Walking'?'selected':''}>Walking</option></select></div><div class="field"><label for="trip-travel">Estimated journey (minutes)</label><input id="trip-travel" type="number" min="1" max="480" value="${Number(state.settings.travel)}"></div><div class="field"><label for="trip-buffer">Arrival buffer (minutes)</label><input id="trip-buffer" type="number" min="0" max="120" value="${Number(state.settings.buffer)}"></div><div class="field"><label for="trip-prep">Get-ready time (minutes)</label><input id="trip-prep" type="number" min="0" max="240" value="${Number(state.settings.prep)}"></div><button class="primary" data-action="save-commute">Save my commute settings</button></div><div class="stack"><div class="card"><h2>Your recommended routine</h2><div id="commute-output"></div></div><div class="card"><h2>Maps & GPS</h2><p class="muted mini">Open navigation to your selected FEU campus. Google Maps may use your device's location after permission is granted.</p><button class="primary" data-action="maps">Open Google Maps ↗</button><button class="secondary" style="margin-left:6px" data-action="location">Check my GPS</button><p class="mini muted" id="gps-output"></p></div><div class="alert">Traffic data is not connected in this version. Adjust the estimate manually for current travel conditions; opening Google Maps does not update the estimate automatically.</div></div></div>`;
}else if(page==='progress'){html=progressPanel();
}else if(page==='settings'){
html=`<div class="grid two"><div class="card"><h2>Student preferences</h2><form id="settings-form"><div class="field"><label>Name</label><input name="name" maxlength="40" required value="${esc(state.settings.name)}"></div><div class="field"><label>FEU campus</label><select name="campus">${['FEU Tech','FEU Manila','FEU Diliman','FEU Alabang'].map(c=>`<option ${state.settings.campus===c?'selected':''}>${c}</option>`).join('')}</select></div><div class="field"><label>Travel mode</label><select name="mode">${['Transit','Driving','Walking'].map(m=>`<option ${state.settings.mode===m?'selected':''}>${m}</option>`).join('')}</select></div><div class="field"><label>Default commute minutes</label><input name="travel" type="number" min="1" max="480" value="${state.settings.travel}"></div><div class="field"><label>Preparation minutes</label><input name="prep" type="number" min="0" max="240" value="${state.settings.prep}"></div><div class="field"><label>Arrival buffer minutes</label><input name="buffer" type="number" min="0" max="120" value="${state.settings.buffer}"></div><button class="primary" type="submit">Save settings</button></form></div><div class="stack"><div class="card"><h2>Your data</h2><p class="muted">Classes, tasks, progress, and feedback are stored online in your Tamaraw Time account. Sign in on another device to access your planner. Research staff can review study results in the protected database.</p><button class="secondary" data-action="export">Export data (JSON)</button> <button class="danger" data-action="reset">Reset planner only</button><p class="mini muted">Your activity history and previously submitted feedback are retained for the pilot study.</p><button class="secondary" style="margin-top:8px" data-action="refresh-cloud">Refresh from cloud</button><div class="settings-help"><h3>Help & onboarding</h3><p class="muted mini">New to Tamaraw Time? Replay the introduction to learn the class schedule, task planner, commute planner, and progress tracking.</p><button type="button" class="secondary" data-action="tutorial">Replay app tutorial</button></div></div></div></div>`;
}
if(page==='home'){let ds=activityDays();html+=`<div class="card home-progress"><div><div class="mini progress-kicker">YOUR PILOT PROGRESS</div><h2>${Math.min(ds.length,3)} of 3 active days</h2><p class="mini muted">${eligibleForFeedback()?'Your feedback form is now ready!':'Use Tamaraw Time on three different dates to unlock feedback.'}</p></div><button class="primary" data-action="go-progress">View progress →</button></div>`}
$('#content').innerHTML=html;if(page==='commute'){updateCommute();$('#class-select')?.addEventListener('change',updateCommute);['trip-travel','trip-buffer','trip-prep'].forEach(id=>$('#'+id)?.addEventListener('input',updateCommute))}}
function updateCommute(){const c=state.classes.find(x=>x.id===$('#class-select')?.value);const el=$('#commute-output');if(!el)return;if(!c){el.innerHTML='<div class="empty">Add a class to see commute recommendations.</div>';return}const st=asMinutes(c.time),n=id=>Math.max(0,Number($('#'+id)?.value)||0),travel=n('trip-travel'),buffer=n('trip-buffer'),prep=n('trip-prep');el.innerHTML=`<div class="highlight"><strong>${esc(c.name)}</strong><div class="mini">${esc(days[Number(c.day)])} • Class at ${ampm(c.time)}</div></div><div class="results"><div class="result"><span>Wake up</span><b>${minutesToTime(st-travel-buffer-prep)}</b></div><div class="result"><span>Leave by</span><b>${minutesToTime(st-travel-buffer)}</b></div><div class="result"><span>Arrive by</span><b>${minutesToTime(st-buffer)}</b></div></div><p class="mini muted">Based on your entered travel time of ${travel} min, ${buffer} min arrival buffer, and ${prep} min preparation time.</p>`}
const fields={task:`<div class="field"><label>Task title *</label><input name="title" required maxlength="100" placeholder="e.g. Submit OOP project"></div><div class="field"><label>Subject</label><input name="subject" maxlength="60" placeholder="e.g. Computer Science"></div><div class="formgrid"><div class="field"><label>Deadline</label><input name="deadline" type="date"></div><div class="field"><label>Priority</label><select name="priority"><option>Medium</option><option>High</option><option>Low</option></select></div></div>`,class:`<div class="field"><label>Subject name *</label><input name="name" maxlength="80" required placeholder="e.g. Database Management"></div><div class="formgrid"><div class="field"><label>Day of week</label><select name="day">${days.map((d,i)=>`<option value="${i}">${d}</option>`).join('')}</select></div><div class="field"><label>Room</label><input name="room" maxlength="40" placeholder="Room 401"></div><div class="field"><label>Start time</label><input name="time" type="time" required value="09:00"></div><div class="field"><label>End time</label><input name="end" type="time" required value="10:30"></div></div><div class="field"><label>Campus</label><select name="campus">${['FEU Tech','FEU Manila','FEU Diliman','FEU Alabang'].map(c=>`<option>${c}</option>`).join('')}</select></div>`};
let modalType='task';function openModal(type){modalType=type;$('#modal-title').textContent=type==='task'?'Add a task':'Add a class';$('#modal-fields').innerHTML=fields[type];if(type==='class')$('#modal-fields [name="campus"]').value=state.settings.campus;$('#dialog').showModal()}
function toast(t){let e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(window._toastTimeout);window._toastTimeout=setTimeout(()=>e.style.display='none',2800)}
$('#modal-form').addEventListener('submit',async e=>{
 e.preventDefault();
 const v=Object.fromEntries(new FormData(e.target).entries());
 const mode=modalType;
 if(mode==='class'&&v.end<=v.time){toast('End time must be after start time');return}
 if(mode==='task')state.tasks.push({...v,id:uid(),done:false});
 else state.classes.push({...v,id:uid(),day:Number(v.day)});
 $('#dialog').close();render();toast('Saving to cloud…');
 try{await track(mode==='task'?'task_added':'class_added');toast('Saved online ✓')}
 catch(err){toast('Save failed: '+(err.message||err))}
});
$('#close-modal').onclick=$('#cancel-modal').onclick=()=>$('#dialog').close();$('#quick-add').onclick=()=>openModal('task');document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>navigate(b.dataset.page)));
$('#content').addEventListener('change',async e=>{
 if(e.target.dataset.action!=='toggle')return;
 const t=state.tasks.find(x=>x.id===e.target.dataset.id);
 if(!t||t.done===e.target.checked)return;
 t.done=e.target.checked;const type=t.done?'task_completed':'task_reopened';
 render();toast('Saving to cloud…');
 try{await track(type);toast('Task updated online ✓')}
 catch(err){toast('Cloud update failed: '+(err.message||err))}
});
$('#content').addEventListener('submit',async e=>{
 if(e.target.id==='feedback-form'){
  e.preventDefault();if(!eligibleForFeedback()){toast('Three active days are required for feedback.');navigate('progress');return}
  const v=Object.fromEntries(new FormData(e.target).entries());
  if(![v.overall,v.ease].every(x=>['1','2','3','4','5'].includes(x))||!v.feature||!v.comments.trim()){toast('Complete the required feedback fields');return}
  const btn=e.target.querySelector('button[type=submit]');if(btn)btn.disabled=true;
  try{
   await writeQueue.catch(()=>{});
   state.feedback=await CloudStore.saveFeedback({code:v.code.trim(),overall:Number(v.overall),ease:Number(v.ease),feature:v.feature,comments:v.comments.trim()});
   render();toast('Feedback saved to the study database.');
  }catch(err){toast('Feedback not saved: '+(err.message||err));if(btn)btn.disabled=false}
  return;
 }
 if(e.target.id!=='settings-form')return;
 e.preventDefault();const v=Object.fromEntries(new FormData(e.target).entries());
 const s={...v,name:v.name.trim()||'Tamaraw',travel:Number(v.travel),prep:Number(v.prep),buffer:Number(v.buffer)};
 const changed=Object.keys(s).some(k=>s[k]!==state.settings[k]);
 state.settings=s;navigate('settings');
 if(!changed){toast('No changes to save');return}
 toast('Saving to cloud…');
 try{await track('settings_saved');toast('Settings saved online ✓')}
 catch(err){toast('Cloud save failed: '+(err.message||err))}
});
$('#content').addEventListener('click',async e=>{
 const b=e.target.closest('button[data-action]');if(!b)return;
 const a=b.dataset.action,id=b.dataset.id;
 if(a==='add-task'||a==='add-class'){openModal(a==='add-task'?'task':'class');return}
 if(a.startsWith('go-')){const dest={'go-commute':'commute','go-schedule':'schedule','go-tasks':'tasks','go-progress':'progress'}[a];if(dest)navigate(dest);return}
 if(a==='tutorial'){showTutorial();return}
 if(a==='export-progress'){exportProgressCSV();return}
 if(a==='export'){
  downloadText('tamaraw-time-full-record.json',JSON.stringify({...state,exportedAt:new Date().toISOString(),researchNote:'Cloud data from signed-in account; not independent proof of use.'},null,2),'application/json');return;
 }
 if(a==='del-task'||a==='del-class'){
  if(!confirm('Delete this item?'))return;
  if(a==='del-task')state.tasks=state.tasks.filter(t=>t.id!==id);
  else state.classes=state.classes.filter(c=>c.id!==id);
  render();toast('Saving to cloud…');
  try{await track(a==='del-task'?'task_deleted':'class_deleted');toast('Deleted online ✓')}
  catch(err){toast('Cloud save failed: '+(err.message||err))}
  return;
 }
 if(a==='save-commute'){
  const v=id=>Number($('#'+id).value),tr=v('trip-travel'),bf=v('trip-buffer'),pr=v('trip-prep');
  if(!Number.isFinite(tr)||tr<1||tr>480||!Number.isFinite(bf)||bf<0||bf>120||!Number.isFinite(pr)||pr<0||pr>240){toast('Please enter valid times');return}
  const x={travel:tr,buffer:bf,prep:pr,mode:$('#trip-mode').value};
  const changed=Object.keys(x).some(k=>state.settings[k]!==x[k]);
  Object.assign(state.settings,x);render();
  if(!changed){toast('No changes to save');return}
  toast('Saving to cloud…');
  try{await track('commute_saved');toast('Commute settings saved online ✓')}
  catch(err){toast('Cloud save failed: '+(err.message||err))}
  return;
 }
 if(a==='maps'){
  const destination={'FEU Tech':'FEU Institute of Technology Manila','FEU Manila':'Far Eastern University Manila','FEU Diliman':'FEU Diliman Quezon City','FEU Alabang':'FEU Alabang Muntinlupa'}[state.settings.campus]||state.settings.campus;
  const mode=$('#trip-mode')?.value||state.settings.mode;
  const travelmode=mode==='Transit'?'transit':mode==='Driving'?'driving':'walking';
  window.open('https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(destination)+'&travelmode='+travelmode,'_blank','noopener,noreferrer');
  track('maps_opened').catch(()=>{});return;
 }
 if(a==='location'){
  const out=$('#gps-output');if(!navigator.geolocation){out.textContent='GPS is not supported in this browser.';return}
  out.textContent='Requesting location permission…';
  navigator.geolocation.getCurrentPosition(()=>{
   out.textContent='GPS location detected. Open Maps to navigate.';
   track('gps_checked').catch(()=>{});
  },err=>{out.textContent='Location unavailable: '+err.message},{enableHighAccuracy:true,timeout:12000});return;
 }
 if(a==='refresh-cloud'){
  try{await refreshCloud();toast('Loaded the latest cloud data ✓')}
  catch(err){toast('Refresh failed: '+(err.message||err))}
  return;
 }
 if(a==='reset'){
  if(!confirm('Clear classes, tasks and preferences? Your activity logs and feedback remain saved online for the study.'))return;
  const before=payload();
  state.classes=[];state.tasks=[];state.settings={...defaults.settings};
  try{await save();navigate('settings');toast('Planner reset online; study history retained')}
  catch(err){state.classes=before.classes;state.tasks=before.tasks;state.settings=before.settings;render();toast('Reset failed: '+(err.message||err))}
 }
});
$('#today').textContent=new Date().toLocaleDateString('en-PH',{weekday:'short',month:'long',day:'numeric'});
$('#tutorial-next').addEventListener('click',()=>{if(tutorialIndex===tutorialSteps.length-1){finishTutorial();navigate('schedule')}else{tutorialIndex++;renderTutorial()}});
$('#tutorial-prev').addEventListener('click',()=>{if(tutorialIndex>0){tutorialIndex--;renderTutorial()}});
$('#tutorial-close').addEventListener('click',finishTutorial);
$('#tutorial-skip').addEventListener('click',finishTutorial);
$('#tutorial-dialog').addEventListener('cancel',()=>{state.onboarding.finished=true;save()});
// Authentication and initial loading. No planner information is saved locally.
function authMode(mode){
 const signUp=mode==='signup';
 $('#auth-form').dataset.mode=mode;
 $('#auth-submit').textContent=signUp?'Create student account':'Sign in';
 $('#auth-heading').textContent=signUp?'Create your Tamaraw Time account':'Welcome back, Tamaraw!';
 $('#auth-mode-toggle').textContent=signUp?'Already have an account? Sign in':'New here? Create an account';
 $('#auth-consent').hidden=!signUp;
 $('#study-consent').required=signUp;
 $('#auth-password').autocomplete=signUp?'new-password':'current-password';
 $('#auth-message').textContent='';
}
function authMessage(msg){$('#auth-message').textContent=msg;}
function showAuth(msg=''){
 loadedFor=null;CloudStore.setUser(null);
 $('#app-layout').hidden=true;$('#auth-screen').hidden=false;
 $('#account-email').textContent='';
 if($('#tutorial-dialog').open)$('#tutorial-dialog').close();
 authMessage(msg);
 if(!CloudStore.configured){
  authMessage('Cloud database not connected yet. The project owner must configure cloud-config.js and run schema.sql in Supabase.');
  $('#auth-submit').disabled=true;
 }
}
async function enterApp(user){
 if(!user||!CloudStore.configured||loadedFor===user.id)return;
 const ticket=++authCounter;
 CloudStore.setUser(user);
 authMessage('Loading your cloud planner…');
 try{
  const data=await CloudStore.load();
  if(ticket!==authCounter)return;
  const v=data.payload;
  state={
   classes:Array.isArray(v?.classes)?v.classes:[],
   tasks:Array.isArray(v?.tasks)?v.tasks:[],
   settings:{...defaults.settings,...(v?.settings||{})},
   onboarding:{finished:!!v?.onboarding?.finished},
   tracker:{events:data.events},feedback:data.feedback
  };
  loadedFor=user.id;
  $('#account-email').textContent=user.email||'Student account';
  $('#auth-screen').hidden=true;$('#app-layout').hidden=false;
  navigate('home');
  if(!state.onboarding.finished)setTimeout(showTutorial,100);
 }catch(err){showAuth('Could not load the study database: '+(err.message||err)+'. Verify that schema.sql has been installed.');}
}
async function refreshCloud(){
 if(!CloudStore.getUser())return;
 await writeQueue.catch(()=>{});
 const data=await CloudStore.load();
 const v=data.payload;
 state={classes:Array.isArray(v?.classes)?v.classes:[],tasks:Array.isArray(v?.tasks)?v.tasks:[],
  settings:{...defaults.settings,...(v?.settings||{})},onboarding:{finished:!!v?.onboarding?.finished},
  tracker:{events:data.events},feedback:data.feedback};
 navigate(page);
}
$('#auth-mode-toggle').addEventListener('click',()=>authMode($('#auth-form').dataset.mode==='signup'?'login':'signup'));
$('#auth-form').addEventListener('submit',async e=>{
 e.preventDefault();if(!CloudStore.configured)return;
 const btn=$('#auth-submit'),mode=e.target.dataset.mode;
 const email=$('#auth-email').value.trim(),password=$('#auth-password').value;
 if(mode==='signup'&&!$('#study-consent').checked){authMessage('Please read and accept the pilot-study notice.');return}
 btn.disabled=true;authMessage(mode==='signup'?'Creating your account…':'Signing you in…');
 try{
  const res=mode==='signup'?await CloudStore.db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}}):
    await CloudStore.db.auth.signInWithPassword({email,password});
  if(res.error)throw res.error;
  if(mode==='signup'&&!res.data.session)authMessage('Account created. Check your email to confirm your address, then return and sign in.');
  else if(res.data.user)await enterApp(res.data.user);
 }catch(err){authMessage(err.message||'Authentication failed. Please retry.')}
 finally{btn.disabled=false}
});
$('#signout-button').addEventListener('click',async()=>{
 await writeQueue.catch(()=>{});
 const {error}=await CloudStore.db.auth.signOut();
 if(error){toast('Could not sign out: '+error.message);return}
 ++authCounter;showAuth('You have signed out. Your planner is safely stored online.');
});
async function boot(){
 authMode('login');
 if(!CloudStore.configured){showAuth();return}
 CloudStore.db.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT') {++authCounter;showAuth('Signed out.');}
  else if(event==='SIGNED_IN'&&session?.user)setTimeout(()=>enterApp(session.user),0);
 });
 const {data,error}=await CloudStore.db.auth.getSession();
 if(error){showAuth(error.message);return}
 if(data.session?.user)await enterApp(data.session.user);
 else showAuth();
}
boot();
