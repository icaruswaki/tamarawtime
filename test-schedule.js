'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');
const line=(prefix)=>source.split('\n').find(value=>value.startsWith(prefix));
const nextDate=source.match(/function nextClassDate\(c\)\{[\s\S]*?(?=\nconst upcoming)/)?.[0];
const travelFunction=source.match(/function currentTravel\(c,[\s\S]*?(?=\nfunction applyTheme)/)?.[0];
const context={Date,Intl,Number,Set};
vm.createContext(context);
vm.runInContext([line('const classWeekdays'),line('const manilaDateParts'),nextDate,line('const upcoming'),travelFunction].join('\n'),context);
const multi={id:'math',day:1,weekdays:[1,3,1],time:'09:00'};
assert.deepEqual(Array.from(vm.runInContext('classWeekdays(multi)',Object.assign(context,{multi}))),[1,3]);
const legacy={id:'history',day:5,time:'13:00'};
assert.deepEqual(Array.from(vm.runInContext('classWeekdays(legacy)',Object.assign(context,{legacy}))),[5]);
context.state={classes:[multi,legacy]};
const upcoming=vm.runInContext('upcoming()',context);
assert.equal(upcoming.length,3,'A legacy once-weekly class and a two-day class should produce three upcoming occurrences');
for(const item of upcoming){
 const weekday=new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'Asia/Manila'}).format(item.when);
 assert.equal(weekday,['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][item.day]);
}
context.state={settings:{campus:'FEU Tech',travel:55,campusTravel:{'FEU Tech':40}},classes:[]};context.activeRouteEstimate=null;
assert.equal(vm.runInContext("currentTravel({campus:'FEU Tech',travel:32})",context),32,'Class-specific time has first priority');
assert.equal(vm.runInContext("currentTravel({campus:'FEU Tech'})",context),40,'Campus default is used when a class override is absent');
assert.equal(vm.runInContext("currentTravel({campus:'FEU Manila'})",context),55,'General default covers campuses without an override');
context.activeRouteEstimate={campus:'FEU Tech',mode:'Walking',at:Date.now(),minutes:22};
assert.equal(vm.runInContext("currentTravel({campus:'FEU Tech',travel:32},'Walking')",context),22,'Fresh route estimate is applied temporarily');
console.log('PASS: legacy and multi-weekday schedules, Manila-time dates, route/class/campus/default ETA priority');
