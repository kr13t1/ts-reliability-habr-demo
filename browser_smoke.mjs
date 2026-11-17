import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { chromium } from 'playwright';

await mkdir('browser-evidence', {recursive:true});
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:960}});
 const errors=[], external=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('request',r=>{if(/^https?:/i.test(r.url()))external.push(r.url());});
 await page.goto(pathToFileURL(path.resolve('index.html')).href);
 await page.locator('#guidePlotWrap svg path').first().waitFor({state:'visible'});
 assert.equal(await page.locator('#guideProgress').textContent(),'Шаг 1 из 4');
 assert.equal(await page.locator('#guideBack').isDisabled(),true);
 assert.equal(await page.locator('#advanced').getAttribute('open'),null);
 assert.equal(await page.locator('#guidePlotWrap path').count(),1);
 await page.screenshot({path:'browser-evidence/01-start.png',fullPage:true});
 await page.locator('#guideNext').click();
 assert.equal(await page.locator('#guidePlotWrap path').count(),2);
 await page.screenshot({path:'browser-evidence/02-freeze.png',fullPage:true});
 await page.locator('#guideNext').click();
 assert.match(await page.locator('#guideResult').innerText(),/1191 из 1191/);
 await page.locator('#guideNext').click();
 assert.match(await page.locator('#guidePlotWrap').textContent(),/1190: лишняя отметка/);
 await page.screenshot({path:'browser-evidence/03-boundary.png',fullPage:true});
 await page.locator('#guideBack').click();
 assert.equal(await page.locator('#guideProgress').textContent(),'Шаг 3 из 4');
 await page.locator('#guideNext').click();
 await page.locator('#guideNext').click();
 assert.equal(await page.locator('#guideProgress').textContent(),'Шаг 1 из 4');
 await page.locator('#advanced summary').click();
 assert.equal(await page.locator('#nAssigned').innerText(),'1191');
 assert.equal(await page.locator('#nPredicted').innerText(),'1192');
 assert.equal(await page.locator('#nFP').innerText(),'1');
 await page.locator('[data-case="clean"]').click();
 assert.equal(await page.locator('#nPredicted').innerText(),'0');
 await page.locator('[data-case="standing"]').click();
 assert.equal(await page.locator('#nPredicted').innerText(),'0');
 await page.locator('[data-case="freeze"]').click();
 await page.locator('[data-axis="y"]').click();
 await page.locator('[data-visible="reference"]').uncheck();
 await page.locator('#reset').click();
 assert.equal(await page.locator('[data-visible="reference"]').isChecked(),true);
 assert.equal(await page.locator('[data-axis="x"]').getAttribute('aria-pressed'),'true');
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[]);
 // Numerical geometry regression: verify ticks against independently inferred path mapping.
 for(const zoom of ['all','region','boundary']){
   await page.locator('[data-zoom="'+zoom+'"]').click();
   const g=await page.evaluate(()=>{
     const svg=document.querySelector('#plot'), paths=[...svg.querySelectorAll('path')];
     const coords=p=>Array.from(p.getAttribute('d').matchAll(/[ML](-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g),m=>[+m[1],+m[2]]);
     const [start,end]=document.querySelector('#windowLabel').textContent.split('–').map(Number);
     const values=DB.walking.slice(start,end+1).map(r=>r[0]);
     const ys=coords(paths[0]), os=coords(paths[1]);
     const i=values.indexOf(Math.min(...values)),j=values.indexOf(Math.max(...values));
     const slope=(ys[j][1]-ys[i][1])/(values[j]-values[i]), intercept=ys[i][1]-slope*values[i];
     const ticks=[...svg.querySelectorAll('text')].filter(e=>e.getAttribute('x')==='64').map(e=>({y:+e.getAttribute('y')-4,value:+e.textContent.replace(',','.')}));
     const err=Math.max(...ticks.map(t=>Math.abs((t.y-intercept)/slope-t.value)));
     const plateauErr=Math.max(...os.map((p,i)=>start+i>=1191&&start+i<2382?Math.abs((p[1]-intercept)/slope-DB.walking[1190][0]):0));
     const clipped=[...svg.querySelectorAll('rect')].every(r=>+r.getAttribute('x')>=72&&+r.getAttribute('x')+(+r.getAttribute('width'))<=907.00001);
     return {start,end,err,plateauErr,clipped,ticks:ticks.length};
   });
   assert.equal(g.ticks,5);
   assert.ok(g.err<0.005,JSON.stringify(g));
   assert.ok(g.plateauErr<0.005,JSON.stringify(g));
   assert.equal(g.clipped,true);
   if(zoom==='region')assert.ok(g.start<=1191&&g.end>=2381,JSON.stringify(g));
 }
 await page.locator('#reset').click();
 for(let i=0;i<3;i++)await page.locator('#guideNext').click();
 for(const width of [390,320]){
   await page.setViewportSize({width,height:844});
   const mobile=await page.evaluate(()=>{
     const boxes=[...document.querySelectorAll('.chart-scroll')];
     return {noOverflow:document.documentElement.scrollWidth<=innerWidth,charts:boxes.map(b=>{
       const svg=b.querySelector('svg'), scale=svg.getBoundingClientRect().width/svg.viewBox.baseVal.width;
       const minFont=Math.min(...[...svg.querySelectorAll('text')].map(t=>parseFloat(getComputedStyle(t).fontSize)*scale));
       b.scrollLeft=b.scrollWidth-b.clientWidth;
       const canScroll=b.scrollLeft>0;
       b.scrollLeft=0;
       return {minFont,canScroll};
     }),legend:getComputedStyle(document.querySelector('#guideLegend')).fontSize,boundary:document.querySelector('#guideResult').textContent};
   });
   assert.ok(mobile.noOverflow,JSON.stringify(mobile));
   assert.ok(mobile.charts.every(c=>c.minFont>=12&&c.canScroll),JSON.stringify(mobile));
   assert.ok(parseFloat(mobile.legend)>=14);
   assert.match(mobile.boundary,/1190.*1191/);
   for(const [name,selector] of [['guide','#guidePlotWrap'],['advanced','#demo .chart-scroll']]){
     const box=page.locator(selector);
     await box.evaluate(b=>{b.scrollLeft=(b.scrollWidth-b.clientWidth)*.35;});
     await box.screenshot({path:'browser-evidence/05-'+name+'-'+width+'.png'});
   }
   await page.screenshot({path:'browser-evidence/06-mobile-'+width+'.png',fullPage:true});
 }
 assert.deepEqual(errors,[]);
 assert.deepEqual(external,[]);
 console.log('PASS guided UI, advanced controls, numerical grid/path and plateau consistency, whole freeze region, clipped masks, readable scrolling at 320/390px, offline runtime');
} finally {await browser.close();}
