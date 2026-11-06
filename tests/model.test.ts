import {test} from 'node:test';
import assert from 'node:assert/strict';
import {csv,filterEvents,kstDate,project,readState,validDate,type Quake,type Filters} from '../src/model';
const event=(overrides:Partial<Quake>={}):Quake=>({id:'kma-test',time:'2020-01-01T15:00:00Z',lat:36,lon:128,depth:12,mag:3,magType:'ML',intensity:null,place:'경주',source:'KMA',url:'https://www.weather.go.kr/',...overrides});
const filter:Filters={region:'korea',from:'2020-01-02',to:'2020-01-02',minMag:0,maxDepth:100,unknown:true,kma:true,usgs:true};
test('KST date boundaries are inclusive through the last second, excluding adjacent days',()=>{
  const events=[event({id:'before',time:'2020-01-01T14:59:59Z'}),event({id:'start'}),event({id:'end',time:'2020-01-02T14:59:59Z'}),event({id:'after',time:'2020-01-02T15:00:00Z'})];
  assert.deepEqual(filterEvents(events,filter).map(e=>e.id),['start','end']);assert.equal(kstDate(events[1].time),'2020-01-02');
});
test('unknown depth never becomes a zero-depth event and obeys its own visibility switch',()=>{
  const events=[event({id:'unknown',depth:null}),event({id:'surface',depth:0}),event({id:'deep',depth:200})];
  assert.deepEqual(filterEvents(events,{...filter,maxDepth:0}).map(e=>e.id),['unknown','surface']);
  assert.deepEqual(filterEvents(events,{...filter,maxDepth:0,unknown:false}).map(e=>e.id),['surface']);
});
test('region, source, and magnitude filters intersect correctly',()=>{
  const events=[event(),event({id:'tokyo',source:'USGS',lon:140,lat:36,mag:5}),event({id:'low',mag:1})];
  assert.equal(filterEvents(events,{...filter,minMag:2}).length,1);
  assert.equal(filterEvents(events,{...filter,region:'eastasia',minMag:2}).length,2);
  assert.equal(filterEvents(events,{...filter,region:'eastasia',kma:false}).length,1);
  assert.equal(filterEvents(events,{...filter,kma:false,usgs:false}).length,0);
});
test('projection uses km, centers exactly, and places north on negative z',()=>{
  assert.deepEqual(project(127,37,[127,37]),[0,-0]);
  assert.ok(Math.abs(project(127,38,[127,37])[1]+111.195)<.01);
  assert.ok(Math.abs(project(128,37,[127,37])[0]-88.804)<.02);
});
test('malformed shared dates and non-finite numeric parameters cannot corrupt filters',()=>{
  assert.equal(validDate('2020-02-30'),false);assert.equal(validDate('2020-02-29'),true);
  const state=readState('?region=evil&maxDepth=NaN&minMag=Infinity&scale=-1&from=2020-02-30&to=2099-01-01','2026-11-06');
  assert.deepEqual(state,{});
  assert.deepEqual(readState('?from=2021-01-01&to=2020-01-01&unknown=0','2026-11-06'),{from:'2020-01-01',to:'2021-01-01',unknown:false});
});
test('CSV preserves missing depth, quotes delimiters, and neutralizes spreadsheet formula fields',()=>{
  const out=csv([event({depth:null,place:'=HYPERLINK("x","y")'})]);
  assert.ok(out.startsWith('\uFEFF'));assert.ok(out.includes('"128","","3"'));assert.ok(out.includes('"\'=HYPERLINK(""x"",""y"")"'));
});
