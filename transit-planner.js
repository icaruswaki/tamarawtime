/* Reviewed, bounded rail journey planner. Historical GTFS is never routed. */
(function(root){
 'use strict';
 const GRAPH_URL='./assets/transit/local_transit_graph.json';
 const FARES_URL='./assets/transit/rail_fares_reviewed.json';
 const FOOT='https://routing.openstreetmap.de/routed-foot/route/v1/driving/';
 let dataPromise=null,faresPromise=null;
 const distance=(a,b)=>{const r=Math.PI/180,p=(b.lat-a.lat)*r,l=(b.lng-a.lng)*r,x=Math.sin(p/2)**2+Math.cos(a.lat*r)*Math.cos(b.lat*r)*Math.sin(l/2)**2;return 12742000*Math.asin(Math.min(1,Math.sqrt(x)));};
 async function load(){
  if(!dataPromise)dataPromise=fetch(GRAPH_URL).then(r=>{if(!r.ok)throw Error('Reviewed rail network could not be loaded.');return r.json();}).then(d=>{if(d.status!=='reviewed_network_model'||!Array.isArray(d.stops)||!Array.isArray(d.edges))throw Error('Rail network data is invalid.');return d;}).catch(e=>{dataPromise=null;throw e;});
  return dataPromise;
 }
 async function loadFares(){if(!faresPromise)faresPromise=fetch(FARES_URL).then(r=>r.ok?r.json():null).catch(()=>null);return faresPromise;}
 async function mapLimit(items,limit,mapper){const output=new Array(items.length);let next=0;await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const index=next++;output[index]=await mapper(items[index],index);}}));return output;}
 async function walk(a,b,maxMeters){
  const url=FOOT+`${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);let r;try{r=await fetch(url,{headers:{Accept:'application/json'},signal:controller.signal});}finally{clearTimeout(timeout);}if(!r.ok)throw Error('Pedestrian router unavailable');
  const d=await r.json(),route=d.routes?.[0],coords=route?.geometry?.coordinates;
  if(d.code!=='Ok'||!route||!Array.isArray(coords)||coords.length<2||!Number.isFinite(route.duration)||route.duration<=0||route.distance>maxMeters)throw Error('No suitable pedestrian path');
  const points=coords.map(([lng,lat])=>[Number(lat),Number(lng)]);
  if(distance({lat:points[0][0],lng:points[0][1]},a)>80||distance({lat:points.at(-1)[0],lng:points.at(-1)[1]},b)>80)throw Error('Pedestrian path does not connect to the mapped entrance');
  return {points,meters:route.distance,seconds:route.duration};
 }
 function paths(graph,from,to,now,walkingEdges=[]){
  const allEdges=[...graph.edges,...walkingEdges];
  const queue=[{at:from,edges:[],seen:new Set([from]),cost:0,service:''}],found=[];
  while(queue.length&&found.length<3){queue.sort((a,b)=>a.cost-b.cost);const item=queue.shift();if(item.at===to){found.push(item.edges);continue;}
   for(const e of allEdges){if(e.from!==item.at||item.seen.has(e.to)||new Date(e.review.valid_until)<=now||new Date(e.review.reviewed_on)>now||e.boarding_allowed===false||e.alighting_allowed===false)continue;
    const nservice=e.vehicle==='WALK'?'':`${e.line}|${e.direction}`,switchCost=item.service&&nservice&&item.service!==nservice?4:0;
    const seen=new Set(item.seen);seen.add(e.to);queue.push({at:e.to,edges:[...item.edges,e],seen,cost:item.cost+1+switchCost,service:nservice||item.service});
   }
  }
  return found;
 }
 async function estimate(origin,destination,mode='Transit'){
  const graph=await load(),now=new Date();
  const eligible=graph.stops.filter(s=>new Date(s.review.valid_until)>now&&new Date(s.review.reviewed_on)<=now);
  const near=(p,boarding)=>eligible.filter(s=>boarding?s.boarding_allowed!==false:s.alighting_allowed!==false).map(s=>({s,d:distance(p,{lat:s.access_coordinates[1],lng:s.access_coordinates[0]})})).filter(x=>x.d<=1800).sort((a,b)=>a.d-b.d).slice(0,3);
  const starts=near(origin,true),ends=near(destination,false);
  const access=await mapLimit(starts,3,async x=>{try{return [x.s.id,await walk(origin,{lat:x.s.access_coordinates[1],lng:x.s.access_coordinates[0]},2200)];}catch(_){return null;}});
  const egress=await mapLimit(ends,3,async x=>{try{return [x.s.id,await walk({lat:x.s.access_coordinates[1],lng:x.s.access_coordinates[0]},destination,2200)];}catch(_){return null;}});
  const aMap=new Map(access.filter(Boolean)),bMap=new Map(egress.filter(Boolean)),byId=new Map(graph.stops.map(s=>[s.id,s])),options=[],seen=new Set();
  const walkingEdges=await mapLimit((graph.transfers||[]).filter(t=>new Date(t.review.valid_until)>now&&new Date(t.review.reviewed_on)<=now),3,async t=>{try{const from=byId.get(t.from),to=byId.get(t.to);if(!from||!to)return null;const route=await walk({lat:from.access_coordinates[1],lng:from.access_coordinates[0]},{lat:to.access_coordinates[1],lng:to.access_coordinates[0]},1200);return {id:`walk-${t.from}-${t.to}`,from:t.from,to:t.to,line:'Walking transfer',direction:to.name,vehicle:'WALK',geometry:{type:'LineString',coordinates:route.points.map(([lat,lng])=>[lng,lat])},ride_seconds:route.seconds,traveled_meters:route.meters,review:t.review,boarding_allowed:true,alighting_allowed:true};}catch(_){return null;}});
  const validWalkingEdges=walkingEdges.filter(Boolean);
  for(const [a,accessRoute] of aMap)for(const [b,exitRoute] of bMap)for(const route of paths(graph,a,b,now,validWalkingEdges)){
   if(!route.length)continue;
   if(mode==='Train'&&route.some(e=>e.vehicle!=='RAIL'&&e.vehicle!=='WALK'))continue;
   if(route.some(e=>!['RAIL','WALK','SUBWAY','TRAM'].includes(e.vehicle)))continue;
   const key=route.map(e=>e.id).join('|');if(seen.has(key))continue;seen.add(key);
   const transit=route.filter(e=>e.vehicle!=='WALK');if(!transit.length)continue;
   const lines=[...new Set(transit.map(e=>e.line))],stops=[byId.get(a),...route.map(e=>byId.get(e.to))].filter(Boolean);
   const transferWalk=route.filter(e=>e.vehicle==='WALK').reduce((n,e)=>n+e.traveled_meters,0),transferSeconds=route.filter(e=>e.vehicle==='WALK').reduce((n,e)=>n+e.ride_seconds,0);
   const option={access:accessRoute,egress:exitRoute,edges:route,lines,stops,transfers:Math.max(0,new Set(transit.map(e=>`${e.line}|${e.direction}`)).size-1),walkMeters:accessRoute.meters+exitRoute.meters+transferWalk,walkSeconds:accessRoute.seconds+exitRoute.seconds+transferSeconds,totalSeconds:null,fare:null};
   const firstRide=transit[0],lastRide=transit.at(-1),boardStop=byId.get(firstRide.from),alightStop=byId.get(lastRide.to);
   const freshTiming=review=>review&&new Date(review.reviewed_on)<=now&&new Date(review.valid_until)>now;
   const completeTiming=transit.every(e=>Number.isFinite(e.ride_seconds)&&Number.isFinite(e.boarding_wait_seconds)&&freshTiming(e.timing_review))&&Number.isFinite(boardStop?.entry_seconds)&&Number.isFinite(alightStop?.exit_seconds)&&freshTiming(boardStop?.timing_review)&&freshTiming(alightStop?.timing_review);
   if(completeTiming)option.totalSeconds=option.walkSeconds+transit.reduce((n,e)=>n+e.ride_seconds+e.boarding_wait_seconds,boardStop.entry_seconds+alightStop.exit_seconds);
   options.push(option);
  }
  const fareData=await loadFares(),table=fareData?.tables?.find(t=>new Date(t.valid_until)>now&&t.label.includes('LRT-2'));
  for(const o of options){const rail=o.edges.filter(e=>e.vehicle!=='WALK');if(table&&rail.length&&rail.every(e=>e.line==='LRT-2')){const from=byId.get(rail[0].from)?.name,to=byId.get(rail.at(-1).to)?.name,i=table.stations.indexOf(from),j=table.stations.indexOf(to);if(i>=0&&j>=0)o.fare={amount:table.fares[i][j],label:table.label,source:table.source_url};}}
  options.sort((a,b)=>a.transfers-b.transfers||a.walkMeters-b.walkMeters||a.edges.length-b.edges.length);
  return {options:options.slice(0,3),reviewValidUntil:graph.stops[0]?.review?.valid_until,attribution:graph.attribution||'© OpenStreetMap contributors'};
 }
 root.TamarawTransit={estimate,load};
})(window);
