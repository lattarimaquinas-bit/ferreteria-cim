'use strict';
(() => {
  const message=document.querySelector('#offline-message');
  const status=document.querySelector('#offline-status');
  const update=document.querySelector('#offline-update');
  const retry=document.querySelector('#offline-retry');
  let registration,ready=false,applyingUpdate=false;
  function display(){
    status.dataset.ready=String(ready);
    message.textContent=ready?(navigator.onLine?'Lista para usar sin conexión · Incluye PDF, recibos y Excel.':'Sin conexión · Podés trabajar y guardar PDF en este iPad.'):(navigator.onLine?'Preparando uso sin conexión. Mantené la app abierta hasta que indique que está lista.':'La preparación sin conexión no está confirmada. Volvé a conectarte antes de cerrar la app.');
  }
  function check(){
    const worker=navigator.serviceWorker.controller;
    if(!worker){display();return;}
    const channel=new MessageChannel();
    const timer=setTimeout(()=>{channel.port1.close();ready=false;display();retry.hidden=false;},10000);
    channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();ready=event.data?.ready===true;display();retry.hidden=ready;};
    worker.postMessage({type:'CHECK_OFFLINE'},[channel.port2]);
  }
  function waiting(){update.hidden=!registration?.waiting;}
  async function start(){
    retry.hidden=true;display();
    try{
      registration=await navigator.serviceWorker.register('sw.js',{updateViaCache:'none'});
      waiting();
      registration.addEventListener('updatefound',()=>{
        const installing=registration.installing;
        installing?.addEventListener('statechange',()=>{
          if(installing.state==='installed'){waiting();check();}
          if(installing.state==='redundant'&&!ready){message.textContent='No se completó la descarga sin conexión. Revisá internet y tocá Reintentar.';retry.hidden=false;}
        });
      });
      await navigator.serviceWorker.ready;check();
    }catch(error){message.textContent='No se pudo preparar el uso sin conexión. Abrí la app desde su enlace HTTPS con internet y tocá Reintentar.';retry.hidden=false;}
  }
  if(!('serviceWorker' in navigator)||!window.isSecureContext){status.dataset.ready='false';message.textContent='Este navegador no permite preparar la app sin conexión. Usá Safari desde el enlace HTTPS de la app.';return;}
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(applyingUpdate)location.reload();else check();});
  update.onclick=()=>{
    if(document.querySelector('dialog[open]')){alert('Guardá o cerrá primero el formulario o PDF abierto. Después tocá Actualizar app.');return;}
    if(registration?.waiting&&confirm('¿Actualizar la app ahora? Se recargará la pantalla, sin borrar los datos guardados.')){applyingUpdate=true;registration.waiting.postMessage({type:'ACTIVATE_UPDATE'});}
  };
  retry.onclick=()=>{if(registration){registration.update().then(check).catch(()=>{message.textContent='No se pudo descargar. Revisá la conexión a internet.';});}else start();};
  window.addEventListener('online',()=>{display();registration?.update().catch(()=>{});check();});
  window.addEventListener('offline',()=>{display();check();});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){check();if(navigator.onLine)registration?.update().catch(()=>{});}});
  start();
})();
