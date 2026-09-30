import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';


(async()=>{
 const browser=await chromium.launch({...(process.env.BROWSER_CHANNEL ? {channel:process.env.BROWSER_CHANNEL}:{}),headless:true});
 try {
 const snapshot=JSON.parse(readFileSync(new URL('./fixture.json',import.meta.url),'utf8'));
 Object.assign(snapshot.brief,{childrenAges:"",specialOccasion:"",notes:"",accommodation:"Boutique",diningPace:"Relaxed Dining (~90m)"});
 snapshot.itinerary[0].items[0].transitToNext={mode:'walk',duration:'37 min',fromLocation:'Origem com nome muito longo para testar o layout',toLocation:'Destino com nome muito longo para testar o layout',routeNote:'Notas de percurso. '.repeat(30)};
 if(process.env.STRESS){snapshot.itinerary=Array.from({length:12},(_,i)=>({...structuredClone(snapshot.itinerary[0]),dayNumber:i+1,title:'LongTitle'.repeat(35)}));}
 for(const width of (process.env.STRESS?[360]:[320,360,640,768,1440]))for(const language of (process.env.STRESS?['de']:['pt','en','es','fr','de','zh'])) {
 const context=await browser.newContext({viewport:{width,height:width===640?320:700},isMobile:width<768,hasTouch:width<768});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(({snapshot,language,stress})=>{localStorage.setItem('blu-portal-language',language);localStorage.setItem('blu-trips-v1',JSON.stringify([{id:'responsive-test',...snapshot,messages:stress?Array.from({length:40},(_,i)=>({id:String(i),sender:'user',text:'Long conversation message '.repeat(30),timestamp:'12:00'})):[]},...(stress?Array.from({length:40},(_,i)=>({id:'extra-'+i,...snapshot,brief:{...snapshot.brief,customerName:'Extra group '+i},messages:[]})):[])]))},{snapshot,language,stress:Boolean(process.env.STRESS)});
 await page.route('**/api/translate',r=>r.fulfill({json:{texts:r.request().postDataJSON().items.map(i=>i.text)}})); await page.route('**/api/versions?*',r=>r.fulfill({json:[]})); await page.goto(process.env.PORTAL_URL ?? 'http://127.0.0.1:3001');await page.waitForTimeout(500);await page.addStyleTag({content:'nextjs-portal { display:none !important; }'});
 async function check(stage){const overflow=await page.evaluate(()=>({body:document.documentElement.scrollWidth>innerWidth,main:[...document.querySelectorAll('main')].some(e=>e.scrollWidth>e.clientWidth+2)}));if(overflow.body||overflow.main)throw new Error(JSON.stringify({width,language,stage,overflow}));}
 await check('brief');if(await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight+1))throw Error('Page height overflow');
 if(width<1024){
 const trigger=page.locator('[aria-controls="trip-navigation"]');await trigger.click();
 const box=await page.locator('#trip-navigation').boundingBox();if(box.width>=width||box.x!==0)throw Error('drawer bounds');
 await page.keyboard.press('Escape');if(await page.locator('#trip-navigation').isVisible())throw Error('Escape');
 await trigger.click();await page.mouse.click(width-4,100);if(await page.locator('#trip-navigation').isVisible())throw Error('backdrop');
 await trigger.click();
 await page.keyboard.press('Tab');if(!await page.locator('#trip-navigation').evaluate(e=>e.contains(document.activeElement)))throw Error('Drawer focus escaped');
 }

 await page.locator('aside:visible button').filter({hasText:snapshot.brief.customerName}).click();
 if(await page.locator('#trip-navigation').isVisible())throw Error('selection must close drawer');
 if(process.env.STRESS){await page.evaluate(()=>{document.querySelector('main').scrollTop=100000});} await check('itinerary');
 await page.locator('.group.relative.z-10').first().focus();await page.keyboard.press('Enter');
 const modal=page.locator('.transit-dialog[open] > div').last();const bounds=await modal.boundingBox();
 if(bounds.y<0||bounds.y+bounds.height>(width===640?320:700)+1)throw Error('Modal outside viewport');
 await page.keyboard.press('Escape');if(await page.locator('.transit-dialog').isVisible())throw Error('Modal Escape');if(!await page.locator('.group.relative.z-10').first().evaluate(e=>e===document.activeElement))throw Error('Modal focus not restored');
if(width<1280)await page.locator('[aria-controls="curation-assistant"]').click();else {const assistant=await page.locator('#curation-assistant').boundingBox();const itinerary=await page.locator('#curation-assistant').locator('xpath=../preceding-sibling::*[1]').boundingBox();if(!assistant||assistant.x<itinerary.x+itinerary.width-1)throw Error('Desktop assistant must be visible on the right');const frame=await page.locator('.responsive-workspace').boundingBox();if(Math.abs(assistant.y-frame.y)>1||Math.abs(assistant.height-frame.height)>1)throw Error('Assistant must fill workspace height');}await check('assistant');

 if(width===640){await page.evaluate(()=>document.documentElement.style.fontSize='200%');await check('large text');} if(errors.length)throw Error(errors.join('\n'));console.log(width,language,'OK');await context.close();
 }
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});


