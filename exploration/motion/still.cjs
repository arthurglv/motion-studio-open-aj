const fs=require('node:fs'),path=require('node:path'),pup=require('puppeteer-core');
(async()=>{
 const [variant,...frames]=process.argv.slice(2);
 const b=await pup.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:'shell',args:['--hide-scrollbars','--allow-file-access-from-files']});
 const p=await b.newPage();
 p.on('pageerror',e=>console.error('[page]',e.message));
 await p.goto('file://'+path.resolve('exploration/motion/scene.html'),{waitUntil:'load'});
 await p.evaluate(()=>window.ready);
 for(const f of frames){
  const d=await p.evaluate((fr,v)=>{window.drawFrame(+fr,v);return document.getElementById('c').toDataURL('image/jpeg',0.9).slice(23);},f,variant);
  const out=`/tmp/still-${variant}-${f}.jpg`;
  fs.writeFileSync(out,Buffer.from(d,'base64'));console.log(out);
 }
 await b.close();
})();
