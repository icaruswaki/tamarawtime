'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync(__dirname+'/app.js','utf8');
const helper=app.match(/function departureNotificationEligible\(departureAt,now=Date\.now\(\)\)\{[^\n]+\}/)?.[0];
assert(helper,'Missing departure notification timing helper');
const eligible=vm.runInNewContext('('+helper.replace('function departureNotificationEligible','function')+')');
const alarmAt=1_000_000;
assert.equal(eligible(alarmAt,alarmAt-1),false,'Do not fire before the leave time');
assert.equal(eligible(alarmAt,alarmAt),true,'Fire at the recommended leave time');
assert.equal(eligible(alarmAt,alarmAt+4*60_000+59_000),true,'Allow a short background timer delay');
assert.equal(eligible(alarmAt,alarmAt+5*60_000+1),false,'Do not show a stale departure alarm');
for(const contract of [
 'Notification.requestPermission()',
 'registration.showNotification(',
 "navigator.serviceWorker.register('./service-worker.js')",
 'Open Tamaraw Time in <b>Safari</b>',
 'Tap the <b>⋮</b> menu',
 'Alarm reminders are scheduled by this page and may not fire after the browser or installed app is fully closed.',
 'data-action="show-install-guide"'
])assert(app.includes(contract),`Missing notification/install contract: ${contract}`);
const worker=fs.readFileSync(__dirname+'/service-worker.js','utf8');
assert(worker.includes("self.addEventListener('notificationclick'"),'Notification click should reopen the web app');
console.log('PASS: departure alarm timing window, explicit notification permission, service worker, and iOS/Android install guidance');
