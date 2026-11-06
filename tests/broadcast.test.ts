import {test} from 'node:test';
import assert from 'node:assert/strict';
import {broadcastURL,readBroadcast} from '../src/broadcast';
import {readState,type Filters} from '../src/model';

const filters:Filters={region:'korea',from:'2016-09-12',to:'2016-12-31',minMag:2,maxDepth:100,unknown:true,kma:true,usgs:false};
test('broadcast requires an explicit flag, validates the view, and leaves rotation off by default',()=>{
  assert.deepEqual(readBroadcast('?broadcast=true&view=evil'),{enabled:false,title:'',view:'oblique',rotate:false,tour:false,interval:20,speed:.4});
  assert.deepEqual(readBroadcast('?broadcast=1&view=side&rotate=1'),{enabled:true,title:'',view:'side',rotate:true,tour:false,interval:20,speed:.4});
});
test('automatic tour survives an OBS reload and rejects unsupported timings',()=>{
  const options=readBroadcast('?broadcast=1&tour=1&rotate=1&interval=12&speed=1.6');
  assert.equal(options.tour,true);assert.equal(options.rotate,false);
  const url=new URL(broadcastURL('https://example.com/map/',filters,4,false,'kma-2016-364',options));
  assert.deepEqual(readBroadcast(url.search),options);assert.equal(url.searchParams.get('event'),'kma-2016-364');
  for(const input of ['interval=0&speed=Infinity','interval=-12&speed=-1','interval=1e9&speed=garbage']){
    const invalid=readBroadcast(input);assert.equal(invalid.interval,20);assert.equal(invalid.speed,.4);
  }
});
test('broadcast title is bounded by Unicode characters and control characters are removed',()=>{
  const title='🐻'.repeat(70)+'\n';
  const options=readBroadcast(new URLSearchParams({title}).toString());
  assert.equal(Array.from(options.title).length,60);assert.ok(!options.title.includes('\n'));
});
test('OBS URL round-trips the exact filters, selection, vertical scale, and depth coloring',()=>{
  const options={enabled:true,title:'경주 지진 & 과거 기록',view:'side' as const,rotate:false,tour:false,interval:20,speed:.4};
  const u=new URL(broadcastURL('https://example.com/project/?old=1#fragment',filters,4,true,'kma-2016-999',options));
  assert.equal(u.pathname,'/project/');assert.equal(u.hash,'');assert.equal(u.searchParams.has('old'),false);
  assert.deepEqual(readBroadcast(u.search),options);assert.equal(u.searchParams.get('colors'),'1');
  assert.deepEqual({region:'korea',...readState(u.search,'2026-11-06')},{...filters,event:'kma-2016-999',scale:4});
  const regional=new URL(broadcastURL(u.href,{...filters,region:'eastasia'},1,false,undefined,options));
  assert.equal(readState(regional.search,'2026-11-06').region,'eastasia');
  assert.equal(regional.searchParams.has('event'),false);assert.equal(regional.searchParams.get('colors'),'0');
});
