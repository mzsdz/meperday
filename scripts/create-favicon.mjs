// Rasterize the code-native brand mark for legacy favicons and iOS home screens.
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const root=new URL('../public/',import.meta.url),svg=await readFile(new URL('favicon.svg',root),'utf8');
const browser=await chromium.launch(process.env.CI?{}:{channel:'msedge'});
try {
 const page=await browser.newPage({deviceScaleFactor:1});const frames=[];
 for(const size of [16,32,48,180]){
  await page.setViewportSize({width:size,height:size});
  const mark=size===180?svg.replace('rx="16"','rx="0"'):svg;
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${mark}`);
  const png=await page.screenshot({omitBackground:true});
  if(size===180)await writeFile(new URL('apple-touch-icon.png',root),png);else frames.push({size,png});
 }
 const header=Buffer.alloc(6+16*frames.length);header.writeUInt16LE(1,2);header.writeUInt16LE(frames.length,4);let offset=header.length;
 frames.forEach(({size,png},i)=>{const p=6+i*16;header[p]=size;header[p+1]=size;header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(png.length,p+8);header.writeUInt32LE(offset,p+12);offset+=png.length;});
 await writeFile(new URL('favicon.ico',root),Buffer.concat([header,...frames.map(f=>f.png)]));
} finally {await browser.close();}
