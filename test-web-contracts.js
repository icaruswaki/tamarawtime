'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process');
const current=fs.readFileSync('app.js','utf8').replace(/\r/g,''),baseline=cp.execFileSync('git',['show','HEAD:app.js'],{encoding:'utf8'}).replace(/\r/g,'');
for(const name of ['tutorialSteps','tutorialVisual','drawTutorial','showTutorial','finishTutorial']){
 const pattern=name==='tutorialSteps'?/const tutorialSteps=\[[\s\S]*?\n\];/:new RegExp(`function ${name}\\([^]*?(?=\\n(?:function |const |async function ))`);
 assert.equal(current.match(pattern)?.[0],baseline.match(pattern)?.[0],`Web tutorial block ${name} changed`);
}
const html=fs.readFileSync('index.html','utf8');
assert(html.indexOf('src="transit-planner.js')<html.indexOf('src="app.js'),'Transit planner must load before app logic');
for(const id of ['tutorial-dialog','tutorial-step','tutorial-dots','tutorial-next','tutorial-prev','tutorial-skip'])assert(html.includes(`id="${id}"`),`Missing tutorial element ${id}`);
assert(current.includes("localStorage.setItem('tamaraw_local_planner'"),'Device planner should use separate local storage');
assert(current.includes('data-action="show-historical"'),'Historical data must remain a separate reference view');
console.log('PASS: unchanged first-time web tutorial, script order, device planner separation and historical-only directory');
