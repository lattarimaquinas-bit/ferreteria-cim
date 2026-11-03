'use strict';
// Cambiar VERSION al publicar nuevas versiones de los archivos de la app.
const VERSION='2026-11-03-offline-v1';
const PREFIX=`ferreteria-offline-${encodeURIComponent(self.registration.scope)}-`;
const CACHE=PREFIX+VERSION;
const FILES=['index.html','styles.css','app.js','catalogos.js','offline.js','xlsx.full.min.js','jspdf.umd.min.js','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','apple-touch-icon.png'];
const urls=FILES.map(file=>new URL(file,self.registration.scope).href);

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    // Si falta un archivo, no se activa esta versión incompleta.
    await cache.addAll(urls.map(url=>new Request(url,{cache:'reload'})));
  })());
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch',event=>{
  const request=event.request;if(request.method!=='GET')return;
  const url=new URL(request.url);if(url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      const shell=await cache.match(new URL('index.html',self.registration.scope).href);
      return shell||fetch(request);
    })());
    return;
  }
  url.search='';url.hash='';if(!urls.includes(url.href))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);const cached=await cache.match(url.href);
    if(cached)return cached;
    const response=await fetch(request);if(response.ok)await cache.put(url.href,response.clone());return response;
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='ACTIVATE_UPDATE')event.waitUntil(self.skipWaiting());
  if(event.data?.type==='CHECK_OFFLINE')event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);const entries=await Promise.all(urls.map(url=>cache.match(url)));
    event.ports[0]?.postMessage({ready:entries.every(response=>response?.ok),version:VERSION});
  })());
});
