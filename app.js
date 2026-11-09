'use strict';
let companyId = '1';
let companyNames = {'1':'Bonfigli','2':'Dimafe'};
try { const prefs = JSON.parse(localStorage.getItem('ferreteria-companies') || 'null'); if(prefs && ['1','2'].includes(prefs.active)) companyId=prefs.active; for(const id of ['1','2'])if(typeof prefs?.names?.[id]==='string' && prefs.names[id].trim())companyNames[id]=prefs.names[id]; } catch {}
let KEY = companyId==='1'?'ferreteria-crm-v1':'ferreteria-crm-v1-company-2';
const $ = (s, root = document) => root.querySelector(s);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => new Intl.NumberFormat('es-AR', {style:'currency',currency:'ARS'}).format(value);
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const date = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
const prettyDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('es-AR');
let db = {clients:[],products:[],orders:[],payments:[],invoices:[]};
let view = 'panel';
let storageBlocked = false;
const PAYMENT_METHODS=['Efectivo','Transferencia','eCheq','Cheque','Otro'];
function loadCompany() {
  db={clients:[],products:[],orders:[],payments:[],invoices:[]};storageBlocked=false;$('#storage-warning').hidden=true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const data = JSON.parse(raw); validateBackup(data); data.invoices ??= []; db = data; } else if (window.INITIAL_CATALOGS?.[companyId]) { db.products=structuredClone(window.INITIAL_CATALOGS[companyId].products); localStorage.setItem(KEY,JSON.stringify(db)); } }
  catch { storageBlocked = true; $('#storage-warning').hidden = false; $('#storage-warning').textContent = 'No se pudieron leer los datos de esta empresa. Para protegerlos, no se sobrescribirá el almacenamiento. Restaurá un respaldo válido desde Datos.'; }
  $('#company-select').value=companyId;
  for(const option of $('#company-select').options)option.textContent=companyNames[option.value];
  document.title=`${companyNames[companyId]} · CRM`;
}
function savePreferences(){try{localStorage.setItem('ferreteria-companies',JSON.stringify({active:companyId,names:companyNames}));return true;}catch{toast('No se pudieron guardar las preferencias de empresas.');return false;}}
loadCompany();
function persist(next = db) {
  if (storageBlocked) { alert('El almacenamiento está bloqueado para proteger los datos anteriores. Restaurá un respaldo válido.'); return false; }
  try { localStorage.setItem(KEY, JSON.stringify(next)); db = next; return true; }
  catch { alert('No se pudo guardar. Puede faltar espacio o estar bloqueado el almacenamiento del navegador.'); return false; }
}
function commit(change) { const next = structuredClone(db); change(next); return persist(next); }
function toast(text) { $('#toast').textContent = text; $('#toast').hidden = false; clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').hidden = true, 3500); }
function modal(title, html) { $('#modal-title').textContent = `${companyNames[companyId]} · ${title}`; $('#modal-body').innerHTML = html; if (!$('#modal').open) $('#modal').showModal(); }
function close() { $('#modal').close(); }
function client(id) { return db.clients.find(c => c.id === id); }
function activePayments(id) { return db.payments.filter(p=>p.clientId===id&&!p.voidedAt); }
function paymentDetail(p) {return [p.note,...(p.receipt?.tenders||[]).map(t=>`${t.method}${t.reference?` ${t.reference}`:''}${t.bank?` · ${t.bank}`:''}${t.due?` · vence ${prettyDate(t.due)}`:''}: ${money(t.amount)}`)].filter(Boolean).join(' / ');}
function cuitDigits(value) { return String(value??'').replace(/[\s-]/g,''); }
function validCuit(value) { return value===''||/^\d{11}$/.test(value); }
function validEmail(value) { return value===''||(value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)); }
function formatCuit(value) {const digits=cuitDigits(value);return /^\d{11}$/.test(digits)?`${digits.slice(0,2)}-${digits.slice(2,10)}-${digits.slice(10)}`:digits;}
function clientSearch(c) {return `${c.name} ${c.phone} ${c.email||''} ${c.cuit||''} ${formatCuit(c.cuit)} ${c.zone||''}`.toLowerCase();}
function balance(id) { return round((client(id)?.opening || 0) + db.invoices.filter(i => i.clientId === id).reduce((s,i) => s+i.amount,0) - activePayments(id).reduce((s,p) => s+p.amount,0)); }
function invoiceBalances(id) {
  // Pagos a cuenta: primero saldo inicial, luego facturas por fecha de emisión.
  let credit=round(activePayments(id).reduce((s,p)=>s+p.amount,0)-(client(id)?.opening||0));
  credit=Math.max(0,credit);
  return db.invoices.filter(i=>i.clientId===id).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id)).map(i=>{const paid=round(Math.min(credit,i.amount));credit=round(credit-paid);return {...i,paid,pending:round(i.amount-paid)};});
}
function paymentApplications(id,amount) {
  const applications=[];let remaining=amount;
  const payments=activePayments(id).reduce((sum,p)=>sum+p.amount,0);
  const openingPending=round(Math.max(0,(client(id)?.opening||0)-payments));
  const openingPaid=round(Math.min(remaining,openingPending));
  if(openingPaid>0){applications.push({type:'opening',number:'Saldo inicial',amount:openingPaid});remaining=round(remaining-openingPaid);}
  for(const invoice of invoiceBalances(id)){
    const applied=round(Math.min(remaining,invoice.pending));
    if(applied>0){applications.push({type:'invoice',invoiceId:invoice.id,number:invoice.number,amount:applied,invoiceAmount:invoice.amount,pendingAfter:round(invoice.pending-applied)});remaining=round(remaining-applied);}
    if(remaining<=0)break;
  }
  if(remaining>0)applications.push({type:'advance',number:'Pago a cuenta / saldo a favor',amount:remaining});
  return applications;
}
function field(label, name, value = '', type = 'text', extra = '') { return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`; }
function table(headers, rows, empty = 'Todavía no hay registros.') { return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`; }
function clientButton(c) { return `<div><button class="link" data-client="${esc(c.id)}">${esc(c.name)}</button>${c.cuit?`<br><small>CUIT ${esc(formatCuit(c.cuit))}</small>`:''}${c.zone?`<br><small>Zona: ${esc(c.zone)}</small>`:''}${c.email?`<br><small>${esc(c.email)}</small>`:''}<br><div class="actions"><button data-edit-client="${esc(c.id)}">Editar cliente</button><button data-statement="${esc(c.id)}">Estado de cuenta PDF</button></div></div>`; }
function paymentRows(payments) {return payments.map(p=>`<tr><td><div class="actions"><button class="primary" data-receipt="${esc(p.id)}">${p.voidedAt?'Recibo anulado':'Recibo PDF'}${p.receipt?` #${p.receipt.number}`:''}</button>${p.voidedAt?'<span class="badge pending">ANULADO · no afecta el saldo</span>':`<button style="color:#a13f2c" data-void-payment="${esc(p.id)}">Borrar pago</button>`}</div>${paymentDetail(p)?`<small>${esc(paymentDetail(p))}</small>`:''}</td><td>${esc(p.receipt?.clientName||client(p.clientId)?.name)}</td><td>${prettyDate(p.date)}</td><td>${money(p.amount)}</td></tr>`).join('');}
function orderRows(orders) { return orders.map(o=>`<tr><td><div class="actions"><button data-order="${esc(o.id)}">Ver #${esc(o.number)}</button><button data-edit-order="${esc(o.id)}">Editar pedido</button><button class="primary" data-pdf="${esc(o.id)}">Descargar PDF</button></div></td><td>${esc(client(o.clientId)?.name || 'Cliente')}</td><td>${prettyDate(o.date)}</td><td>${money(o.total)}</td><td><span class="badge ${o.status==='Pendiente'?'pending':''}">${esc(o.status)}</span></td></tr>`).join(''); }
function render() {
  const titles = {panel:'Resumen',clientes:'Clientes',productos:'Productos',pedidos:'Pedidos',cuentas:'Cuenta corriente',datos:'Importar y respaldar'};
  $('#title').textContent = titles[view];
  $('#today').textContent = `${companyNames[companyId]} · ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}`;
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  const root = $('#content');
  if (view === 'panel') {
    const owed = db.clients.reduce((s,c)=>s+Math.max(0,balance(c.id)),0);
    root.innerHTML = `${!db.clients.length?'<div class="intro"><div><h2>Bienvenido a tu ferretería</h2><p>Empezá cargando tus clientes y productos. El descuento de cada cliente se aplica solo.</p></div><button data-action="import">Importar desde Excel ↗</button></div>':''}<div class="cards"><div class="card"><small>CLIENTES</small><div class="value">${db.clients.length}</div><small>Con su descuento personalizado</small></div><div class="card"><small>PEDIDOS PENDIENTES</small><div class="value">${db.orders.filter(o=>o.status==='Pendiente').length}</div><small>Para preparar y entregar</small></div><div class="card accent"><small>TOTAL POR COBRAR</small><div class="value">${money(owed)}</div><small>Saldos de cuentas de clientes</small></div></div><div class="grid"><section class="panel"><div class="section-head"><h2>Últimos pedidos</h2><button class="link" data-action="orders">Ver todos →</button></div>${table(['Pedido','Cliente','Fecha','Total','Estado'],orderRows(db.orders.slice().reverse().slice(0,6)),'Tus pedidos van a aparecer acá.')}</section><section class="panel"><h2>Clientes con saldo pendiente</h2>${table(['Cliente','Saldo'],db.clients.filter(c=>balance(c.id)>0).sort((a,b)=>balance(b.id)-balance(a.id)).slice(0,6).map(c=>`<tr><td>${clientButton(c)}</td><td>${money(balance(c.id))}</td></tr>`).join(''),'No hay saldos pendientes.')}</section></div>`;
  }
  if (view === 'clientes') {
    root.innerHTML = `<section class="panel"><div class="toolbar"><input id="search" placeholder="Buscar nombre, teléfono, CUIT o zona…" aria-label="Buscar clientes"><button data-action="client">+ Nuevo cliente</button></div><div class="field"><label for="zone-filter">Zona</label><select id="zone-filter"><option value="">Todas las zonas</option>${[...new Set(db.clients.map(c=>c.zone||'').filter(Boolean))].sort((a,b)=>a.localeCompare(b,'es')).map(zone=>`<option value="${esc(zone)}">${esc(zone)}</option>`).join('')}</select></div><div id="results"></div></section>`;
    const update = () => { const q = $('#search').value.toLowerCase(),zone=$('#zone-filter').value; const clients = db.clients.filter(c=>clientSearch(c).includes(q)&&(!zone||c.zone===zone)); $('#results').innerHTML = table(['Cliente','Teléfono','Descuento','Saldo',''],clients.map(c=>`<tr><td>${clientButton(c)}</td><td>${esc(c.phone || '—')}</td><td><span class="badge">${c.discount}%</span></td><td>${money(balance(c.id))}</td><td><button class="link" data-payment="${esc(c.id)}">Registrar pago</button></td></tr>`).join(''),'No hay clientes para mostrar. Podés agregar uno o importarlo desde Excel.'); }; $('#search').oninput = update;$('#zone-filter').onchange=update; update();
  }
  if (view === 'productos') {
    root.innerHTML = `<section class="panel"><div class="toolbar"><input id="search" placeholder="Buscar por código o descripción…" aria-label="Buscar productos"><button data-action="product">+ Nuevo producto</button></div><div id="results"></div></section>`;
    const update = () => { const q = $('#search').value.toLowerCase(); $('#results').innerHTML = table(['Código','Descripción','Precio de lista',''],db.products.filter(p=>`${p.code} ${p.name}`.toLowerCase().includes(q)).map(p=>`<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${money(p.price)}</td><td><button class="link" data-product="${esc(p.id)}">Editar</button></td></tr>`).join(''),'Cargá tus productos a mano o importá tu lista de Excel.'); }; $('#search').oninput = update; update();
  }
  if (view === 'pedidos') root.innerHTML = `<section class="panel"><h2>Todos los pedidos</h2>${table(['Pedido','Cliente','Fecha','Total','Estado'],orderRows(db.orders.slice().reverse()))}</section>`;
  if (view === 'cuentas') renderAccounts(root);
  if (view === 'datos') renderData(root);
  const omitted=window.INITIAL_CATALOGS?.[companyId]?.omitted;
  if(view==='productos' && omitted?.length)root.insertAdjacentHTML('afterbegin',`<details class="notice"><summary>${omitted.length} producto(s) de la lista original sin precio, no cargados</summary><ul>${omitted.map(p=>`<li>${esc(p.code)} · ${esc(p.name)}</li>`).join('')}</ul></details>`);
}
function editClient(id) {
  const c = client(id) || {name:'',phone:'',address:'',discount:0,opening:0,notes:'',followup:''};
  modal(id?'Editar cliente':'Nuevo cliente',`<form id="client-form"><div class="form-grid">${field('Nombre *','name',c.name,'text','required maxlength="150"')}${field('CUIT (opcional)','cuit',formatCuit(c.cuit),'text','inputmode="numeric" maxlength="13" placeholder="20-12345678-6"')}${field('Zona','zone',c.zone||'','text','maxlength="100" placeholder="Ej.: Norte, Centro, Ruta 8"')}${field('Teléfono','phone',c.phone,'tel')}${field('Dirección','address',c.address)}${field('Descuento personal (%)','discount',c.discount,'number','required min="0" max="100" step="0.01"')}${field('Saldo inicial ($)','opening',c.opening,'number','required step="0.01"')}${field('Recordatorio de seguimiento','followup',c.followup,'date')}</div><div class="field"><label for="notes">Notas</label><textarea id="notes" name="notes">${esc(c.notes)}</textarea></div><p class="help">CUIT: 11 dígitos, con o sin guiones. El saldo inicial es la deuda anterior a usar esta app; un valor negativo representa saldo a favor. El descuento solo afecta pedidos nuevos.</p><div class="form-actions"><button class="primary">Guardar cliente</button></div></form>`);
  $('#client-form .form-grid').insertAdjacentHTML('beforeend',field('Email (opcional)','email',c.email||'','email','maxlength="254" autocomplete="email" placeholder="cliente@ejemplo.com"'));
  $('#client-form').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); const record = {id:id||uid(),name:f.get('name').trim(),cuit:cuitDigits(f.get('cuit')),zone:f.get('zone').trim(),email:f.get('email').trim(),phone:f.get('phone').trim(),address:f.get('address').trim(),discount:Number(f.get('discount')),opening:round(Number(f.get('opening'))),notes:f.get('notes').trim(),followup:f.get('followup')}; if (!record.name) return;if(!validCuit(record.cuit))return alert('El CUIT debe tener 11 dígitos, o quedar vacío.');if(!validEmail(record.email))return alert('Revisá el email, por ejemplo cliente@empresa.com, o dejalo vacío.'); if(commit(n=> {const i=n.clients.findIndex(x=>x.id===id); if(i<0)n.clients.push(record);else n.clients[i]=record;})) {close();render();toast('Cliente guardado');} };
}
function showClient(id) {
  const c = client(id); if(!c)return;
  const movements = [...db.invoices.filter(i=>i.clientId===id).map(i=>({date:i.date,detail:`Factura ${i.number} · vence ${prettyDate(i.due)}`,amount:i.amount})),...activePayments(id).map(p=>({date:p.date,detail:`Pago · ${paymentDetail(p)||'Sin detalle'}`,amount:-p.amount}))].sort((a,b)=>a.date.localeCompare(b.date));
  modal(c.name,`<div class="actions"><span class="badge">Descuento: ${c.discount}%</span><button data-edit-client="${esc(id)}">Editar cliente</button><button class="primary" data-payment="${esc(id)}">Registrar pago</button></div><p>${esc(c.phone)}${c.address?` · ${esc(c.address)}`:''}</p><p class="muted">${esc(c.notes)}</p>${c.followup?`<p class="notice">Seguimiento: ${prettyDate(c.followup)}</p>`:''}<small>SALDO ACTUAL · positivo: debe / negativo: a favor</small><div class="balance">${money(balance(id))}</div>${table(['Fecha','Movimiento','Importe'],`<tr><td>—</td><td>Saldo inicial</td><td>${money(c.opening)}</td></tr>`+movements.map(m=>`<tr><td>${prettyDate(m.date)}</td><td>${esc(m.detail)}</td><td>${money(m.amount)}</td></tr>`).join(''))}`);
  $('#modal-body .actions').insertAdjacentHTML('beforeend',`<button data-statement="${esc(id)}">Estado de cuenta PDF</button>`);
  if(c.email)$('#modal-body .actions').insertAdjacentHTML('afterend',`<p>Email: ${esc(c.email)}</p>`);
  $('#modal-body .actions').insertAdjacentHTML('afterend',`<p>${c.cuit?`CUIT: ${esc(formatCuit(c.cuit))}`:''}${c.zone?` · Zona: ${esc(c.zone)}`:''}</p>`);
  $('#modal-body').insertAdjacentHTML('beforeend',`<h3 style="margin-top:20px">Pagos y recibos</h3>${table(['Recibo / acciones','Cliente','Fecha','Importe'],paymentRows(db.payments.filter(p=>p.clientId===id).slice().reverse()),'Todavía no hay pagos.')}`);
}
function accountStatement(id) {
  const customer=client(id);if(!customer)return null;
  const invoices=db.invoices.filter(i=>i.clientId===id),payments=activePayments(id);
  const items=[...invoices.map(i=>({date:i.date,detail:`Factura ${i.number} - vence ${prettyDate(i.due)}`,debit:i.amount,credit:0,priority:0})),...payments.map(p=>({date:p.date,detail:`Pago${p.receipt?` / Recibo #${p.receipt.number}`:''}${paymentDetail(p)?` - ${paymentDetail(p)}`:''}`,debit:0,credit:p.amount,priority:1}))].sort((a,b)=>a.date.localeCompare(b.date)||a.priority-b.priority);
  let running=customer.opening;
  const rows=[{date:'',detail:'Saldo inicial',debit:Math.max(0,running),credit:Math.max(0,-running),balance:running},...items.map(item=>{running=round(running+item.debit-item.credit);return {...item,balance:running};})];
  return {company:companyNames[companyId],customer:structuredClone(customer),generatedAt:new Date().toISOString(),today:date(),rows,invoiceTotal:round(invoices.reduce((sum,i)=>sum+i.amount,0)),paymentTotal:round(payments.reduce((sum,p)=>sum+p.amount,0)),balance:balance(id),pending:structuredClone(invoiceBalances(id).filter(i=>i.pending>0))};
}
function buildStatementPdf(statement,JsPDF) {
  const doc=new JsPDF({unit:'mm',format:'a4'});
  const text=value=>String(value??'').replace(/[\u00a0\u202f]/g,' ').replace(/\u2212/g,'-');
  const cash=value=>text(money(value));let y=18,section='movements';
  doc.setProperties({title:`${statement.company} - Estado de cuenta - ${statement.customer.name}`,author:statement.company,subject:'Facturas y pagos de cuenta corriente'});
  const pendingHeading=()=>{doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setFillColor(237,242,232);doc.text('FACTURAS PENDIENTES',14,y);y+=8;doc.rect(14,y-4,182,8,'F');doc.text('Factura',15,y+1);doc.text('Vence',122,y+1,{align:'right'});doc.text('Total factura',158,y+1,{align:'right'});doc.text('Pendiente',196,y+1,{align:'right'});y+=12;doc.setFont('helvetica','normal');};
  const heading=()=>{
    y=18;doc.setTextColor(23,62,54);doc.setFont('helvetica','bold');doc.setFontSize(17);
    const company=doc.splitTextToSize(text(statement.company),182);doc.text(company,14,y);y+=company.length*7;
    doc.setFontSize(13);doc.text('ESTADO DE CUENTA',14,y);y+=7;
    doc.setFontSize(11);const customer=doc.splitTextToSize(text(`Cliente: ${statement.customer.name}`),182);doc.text(customer,14,y);y+=customer.length*5+2;
    doc.setFont('helvetica','normal');doc.setFontSize(9);
    if(statement.customer.cuit){doc.text(text(`CUIT: ${formatCuit(statement.customer.cuit)}`),14,y);y+=5;}
    if(statement.customer.zone){const zones=doc.splitTextToSize(text(`Zona: ${statement.customer.zone}`),182);doc.text(zones,14,y);y+=zones.length*4.5;}
    if(statement.customer.email){const emails=doc.splitTextToSize(text(`Email: ${statement.customer.email}`),182);doc.text(emails,14,y);y+=emails.length*4.5;}
    doc.setFontSize(8);doc.text(text(`Generado: ${new Date(statement.generatedAt).toLocaleString('es-AR')}`),14,y);y+=7;
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setFillColor(237,242,232);
    if(section==='movements'){doc.rect(14,y-4,182,8,'F');doc.text('Fecha',15,y+1);doc.text('Movimiento',39,y+1);doc.text('Debe',126,y+1,{align:'right'});doc.text('Haber',159,y+1,{align:'right'});doc.text('Saldo',196,y+1,{align:'right'});y+=12;}
    if(section==='pending')pendingHeading();
    doc.setFont('helvetica','normal');doc.setFontSize(9);
  };
  const page=()=>{doc.addPage();heading();};
  const row=(description,paint,width,x=39)=>{
    const lines=doc.splitTextToSize(text(description),width);let index=0;
    while(index<lines.length){if(y+7>265)page();const available=Math.max(1,Math.floor((265-y)/4.5));const part=lines.slice(index,index+available);doc.text(part,x,y);if(index===0)paint(y);y+=part.length*4.5;index+=part.length;if(index<lines.length)page();}
    doc.setDrawColor(225,230,222);doc.line(14,y,196,y);y+=6;
  };
  heading();
  for(const movement of statement.rows)row(movement.detail,position=>{
    doc.setFontSize(8);doc.text(movement.date?prettyDate(movement.date):'-',14,position);doc.text(movement.debit?cash(movement.debit):'-',126,position,{align:'right'});doc.text(movement.credit?cash(movement.credit):'-',159,position,{align:'right'});doc.text(cash(movement.balance),196,position,{align:'right'});doc.setFontSize(9);
  },51);
  section='summary';if(y+65>270)page();
  const summary=(label,amount,bold=false)=>{if(y+8>270)page();doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(bold?12:10);doc.text(label,14,y);doc.text(cash(amount),196,y,{align:'right'});y+=8;};
  summary('Saldo inicial',statement.customer.opening);summary('Total de facturas',statement.invoiceTotal);summary('Total de pagos',statement.paymentTotal);summary(statement.balance<0?'SALDO A FAVOR DEL CLIENTE':'SALDO PENDIENTE',Math.abs(statement.balance),true);
  doc.setFont('helvetica','normal');doc.setFontSize(9);
  const note='Saldo según todos los movimientos registrados. Los pedidos no generan deuda. Los pagos cubren primero saldo inicial y luego facturas por fecha de emisión.';
  for(const line of doc.splitTextToSize(note,180)){if(y+5>270)page();doc.text(line,14,y);y+=5;}
  section='pending';if(y+32>265)page();else{y+=8;pendingHeading();}
  if(!statement.pending.length)doc.text('No hay facturas pendientes.',14,y);
  for(const invoice of statement.pending)row(`${invoice.number}${invoice.due<statement.today?' - VENCIDA':''}`,position=>{doc.setFontSize(8);doc.text(prettyDate(invoice.due),122,position,{align:'right'});doc.text(cash(invoice.amount),158,position,{align:'right'});doc.text(cash(invoice.pending),196,position,{align:'right'});doc.setFontSize(9);},78,14);
  const count=doc.getNumberOfPages();
  for(let i=1;i<=count;i++){doc.setPage(i);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(110);doc.text('Importes en pesos argentinos. Estado de cuenta informativo, no válido como factura ni recibo.',14,282);doc.text(`${i} / ${count}`,196,288,{align:'right'});}
  return doc;
}
async function downloadStatementPdf(id,button) {
  const snapshot=accountStatement(id);if(!snapshot)return;
  const original=button?.textContent;if(button){button.disabled=true;button.textContent='Preparando…';}
  try{const JsPDF=await loadPdfLibrary();const doc=buildStatementPdf(snapshot,JsPDF);const safe=value=>value.replace(/[^a-zA-Z0-9_-]/g,'-');presentPdf(doc,`${safe(snapshot.company)}-estado-de-cuenta-${safe(snapshot.customer.name)}-${snapshot.today}.pdf`,`Estado de cuenta - ${snapshot.company}`);}
  catch(error){alert(`No se pudo generar el estado de cuenta. ${error.message}`);}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
function renderAccounts(root) {
  root.innerHTML=`<div class="notice"><strong>Control de facturas ya emitidas, no facturación.</strong> Los pedidos no suman deuda, incluidos los anteriores. Se conservan los saldos iniciales y pagos registrados. Los pagos se aplican primero al saldo inicial y luego a las facturas más antiguas por fecha de emisión.</div><section class="panel"><div class="toolbar"><input id="invoice-search" placeholder="Buscar factura o cliente…" aria-label="Buscar facturas"><button class="primary" data-action="invoice">+ Cargar factura</button><button data-action="account-payment">Registrar pago</button></div><div class="field"><label for="invoice-filter">Mostrar</label><select id="invoice-filter"><option value="all">Todas las facturas</option><option value="pending">Pendientes</option><option value="overdue">Vencidas pendientes</option><option value="paid">Pagadas</option></select></div><div id="invoice-results"></div></section><section class="panel" style="margin-top:20px"><h2>Saldos por cliente</h2><div id="account-balances"></div></section>`;
  root.insertAdjacentHTML('beforeend','<section class="panel" style="margin-top:20px"><h2>Pagos y recibos</h2><div id="receipt-history"></div></section>');
  const update=()=>{
    const q=$('#invoice-search').value.toLowerCase(),filter=$('#invoice-filter').value;
    const invoices=db.clients.flatMap(c=>invoiceBalances(c.id)).filter(i=>`${i.number} ${clientSearch(client(i.clientId))}`.toLowerCase().includes(q)).filter(i=>filter==='pending'?i.pending>0:filter==='overdue'?i.pending>0&&i.due<date():filter==='paid'?i.pending===0:true).sort((a,b)=>a.due.localeCompare(b.due));
    $('#invoice-results').innerHTML=table(['Factura / cliente','Importe','Pendiente','Emisión','Vencimiento','Estado'],invoices.map(i=>`<tr><td><button data-invoice="${esc(i.id)}">${esc(i.number)}</button><br>${esc(client(i.clientId)?.name)}</td><td>${money(i.amount)}</td><td>${money(i.pending)}</td><td>${prettyDate(i.date)}</td><td>${prettyDate(i.due)}</td><td><span class="badge ${i.pending>0?'pending':''}">${i.pending===0?'Pagada':i.due<date()?'Vencida':i.paid>0?'Pago parcial':'Pendiente'}</span></td></tr>`).join(''),'No hay facturas para mostrar. Cargá una factura ya emitida; los pedidos no se convierten en facturas.');
    $('#account-balances').innerHTML=table(['Cliente','Saldo inicial','Saldo actual',''],db.clients.filter(c=>clientSearch(c).includes(q)).map(c=>`<tr><td>${clientButton(c)}</td><td>${money(c.opening)}</td><td>${money(balance(c.id))}</td><td><button data-payment="${esc(c.id)}">Registrar pago</button></td></tr>`).join(''));
    $('#receipt-history').innerHTML=table(['Recibo / acciones','Cliente','Fecha','Importe'],paymentRows(db.payments.filter(p=>`${clientSearch(client(p.clientId))} ${p.receipt?.number||''} ${paymentDetail(p)}`.toLowerCase().includes(q)).slice().reverse()),'Todavía no hay pagos registrados.');
  };$('#invoice-search').oninput=update;$('#invoice-filter').onchange=update;update();
}
function editInvoice(id) {
  if(!db.clients.length)return toast('Primero cargá un cliente.');
  const invoice=db.invoices.find(i=>i.id===id)||{clientId:'',number:'',date:date(),due:date(),amount:'',notes:''};
  modal(id?'Editar control de factura':'Cargar factura ya emitida',`<form id="invoice-form"><p class="help">Solo registra una factura existente. No emite comprobantes fiscales ni convierte pedidos en facturas.</p><div class="field"><label for="invoice-client">Cliente</label><select id="invoice-client" required><option value="">Seleccionar…</option>${db.clients.map(c=>`<option value="${esc(c.id)}" ${c.id===invoice.clientId?'selected':''}>${esc(c.name)}</option>`).join('')}</select></div><div class="form-grid">${field('Número de factura','invoice-number',invoice.number,'text','required maxlength="80"')}${field('Importe total ($)','invoice-amount',invoice.amount,'number','required min="0.01" step="0.01"')}${field('Fecha de emisión','invoice-date',invoice.date,'date','required')}${field('Vencimiento','invoice-due',invoice.due,'date','required')}</div>${field('Notas','invoice-notes',invoice.notes)}<div class="form-actions"><button class="primary">Guardar factura</button></div></form>`);
  $('#invoice-form').onsubmit=e=>{e.preventDefault();const record={id:id||uid(),clientId:$('#invoice-client').value,number:$('#invoice-number').value.trim(),amount:round(Number($('#invoice-amount').value)),date:$('#invoice-date').value,due:$('#invoice-due').value,notes:$('#invoice-notes').value.trim()};if(!record.number||!client(record.clientId)||!Number.isFinite(record.amount)||record.amount<=0)return alert('Revisá el cliente, el número y el importe.');if(record.due<record.date)return alert('El vencimiento no puede ser anterior a la emisión.');if(db.invoices.some(i=>i.id!==id&&i.clientId===record.clientId&&i.number.toLowerCase()===record.number.toLowerCase()))return alert('Ese cliente ya tiene cargado ese número de factura.');if(commit(n=>{const index=n.invoices.findIndex(i=>i.id===id);if(index<0)n.invoices.push(record);else n.invoices[index]=record;})){close();view='cuentas';render();toast('Factura registrada para control de cobro');}};
}
function chooseAccountPayment() {
  if(!db.clients.length)return toast('Primero cargá un cliente.');
  modal('Elegir cliente para registrar pago',`<form id="choose-payment"><div class="field"><label for="payment-client">Cliente</label><select id="payment-client" required><option value="">Seleccionar…</option>${db.clients.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${money(balance(c.id))}</option>`).join('')}</select></div><button class="primary">Continuar</button></form>`);$('#choose-payment').onsubmit=e=>{e.preventDefault();payment($('#payment-client').value);};
}
function editProduct(id) {
  const p = db.products.find(p=>p.id===id) || {code:'',name:'',price:0};
  modal(id?'Editar producto':'Nuevo producto',`<form id="product-form">${field('Código *','code',p.code,'text','required')}${field('Descripción *','name',p.name,'text','required')}${field('Precio de lista ($) *','price',p.price,'number','required min="0" step="0.01"')}<div class="form-actions"><button class="primary">Guardar producto</button></div></form>`);
  $('#product-form').onsubmit = e => {e.preventDefault(); const f=new FormData(e.target);const record={id:id||uid(),code:f.get('code').trim(),name:f.get('name').trim(),price:round(Number(f.get('price')))};if(!record.name||!record.code)return;if(record.code.toLowerCase()!==p.code.toLowerCase() && db.products.some(p=>p.id!==id&&p.code.toLowerCase()===record.code.toLowerCase()))return alert('Ese código ya existe.');if(commit(n=>{const i=n.products.findIndex(x=>x.id===id);if(i<0)n.products.push(record);else n.products[i]=record;})){close();render();toast('Producto guardado');}};
}
function payment(id) {
  const c=client(id);if(!c)return;
  const owner=companyId;let sequence=0;
  modal(`Registrar pago · ${c.name}`,`<p>Saldo actual: <strong>${money(balance(id))}</strong></p><form id="payment-form">${field('Fecha de recepción del pago','date',date(),'date','required')}<h3>Medios de pago del recibo</h3><p class="help">Cargá cada eCheq, cheque, transferencia o efectivo por separado. Se suman en un único recibo y se descuentan una sola vez. Registrar un eCheq no controla su acreditación bancaria.</p><div id="payment-tenders"></div><button type="button" id="add-tender">+ Agregar otro medio de pago</button><p class="balance">Total recibido: <span id="payment-total">${money(0)}</span></p>${field('Observaciones (opcional)','note','','text','placeholder="Detalle del pago…"')}<div class="form-actions"><button class="primary">Guardar pago y recibo</button></div></form>`);
  $('#payment-form').insertAdjacentHTML('afterbegin','<p class="help">Pago a cuenta: se aplica primero al saldo inicial y después a las facturas más antiguas por fecha de emisión. No afecta los pedidos.</p>');
  const total=()=>{$('#payment-total').textContent=money(round([...document.querySelectorAll('#payment-tenders [name="amount"]')].reduce((sum,input)=>sum+(Number(input.value)||0),0)));};
  const add=()=>{
    if(document.querySelectorAll('.payment-tender').length>=50)return toast('Podés incluir hasta 50 medios por recibo.');
    const i=sequence++,input=(label,name,type='text',extra='')=>field(label,`${name}-${i}`,'',type,extra).replace(`name="${name}-${i}"`,`name="${name}"`);
    $('#payment-tenders').insertAdjacentHTML('beforeend',`<section class="panel payment-tender" style="margin-bottom:12px"><div class="form-grid"><div class="field"><label for="method-${i}">Medio de pago</label><select id="method-${i}" name="method">${PAYMENT_METHODS.map(m=>`<option>${m}</option>`).join('')}</select></div>${input('Importe recibido ($)','amount','number','required min="0.01" step="0.01"')}${input('Número de eCheq / cheque o referencia','reference','text','maxlength="150"')}${input('Banco (opcional)','bank','text','maxlength="100"')}${input('Vencimiento del cheque (opcional)','due','date')}</div><button type="button" data-remove-tender>Quitar este medio</button></section>`);
    if(i===0)$('#amount-0').id='amount';total();
  };
  $('#add-tender').onclick=add;
  $('#payment-tenders').oninput=total;
  $('#payment-tenders').onclick=e=>{const b=e.target.closest('[data-remove-tender]');if(!b)return;if(document.querySelectorAll('.payment-tender').length===1)return toast('El recibo necesita al menos un medio de pago.');b.closest('.payment-tender').remove();total();};
  add();
  $('#payment-form').onsubmit=e=>{
    e.preventDefault();if(owner!==companyId)return;const f=new FormData(e.target);
    const methods=f.getAll('method'),references=f.getAll('reference'),banks=f.getAll('bank'),dues=f.getAll('due');
    const tenders=f.getAll('amount').map((v,i)=>({method:methods[i],amount:round(Number(v)),reference:String(references[i]||'').trim(),bank:String(banks[i]||'').trim(),due:String(dues[i]||'')}));
    const amount=round(tenders.reduce((sum,t)=>sum+t.amount,0));
    if(!validTenders(tenders,amount))return alert('Revisá los importes. Cada medio debe ser mayor a cero; los eCheq y cheques necesitan su número o referencia.');
    const before=balance(id),after=round(before-amount);if(!Number.isFinite(before)||!Number.isFinite(after))return alert('Revisá los importes de la cuenta.');
    const record={id:uid(),clientId:id,amount,date:f.get('date'),note:f.get('note').trim(),receipt:{number:Math.max(0,...db.payments.map(p=>p.receipt?.number||0))+1,balanceBefore:before,balanceAfter:after,issuedAt:new Date().toISOString(),companyName:companyNames[companyId],clientName:c.name,clientPhone:c.phone,clientAddress:c.address,clientCuit:c.cuit||'',clientZone:c.zone||'',clientEmail:c.email||'',tenders,applications:paymentApplications(id,amount)}};
    if(commit(n=>n.payments.push(record))){render();modal('Pago registrado',`<p>Se recibió <strong>${money(amount)}</strong> de ${esc(c.name)}.</p><div class="order-summary"><div class="summary-row"><span>Saldo anterior</span><span>${money(before)}</span></div><div class="summary-row total"><span>Saldo restante</span><span>${money(after)}</span></div></div><p class="help">Saldo positivo: pendiente de cobro. Saldo negativo: a favor del cliente. Saldos al momento de registrar este pago.</p><button class="primary" data-receipt="${esc(record.id)}">Descargar recibo PDF #${record.receipt.number}</button>`);}
  };
}
function voidPayment(id) {
  const p=db.payments.find(p=>p.id===id);if(!p||p.voidedAt)return;
  const owner=companyId;
  modal('¿Borrar este pago?',`<p>Cliente: <strong>${esc(client(p.clientId)?.name)}</strong><br>Fecha: ${prettyDate(p.date)}<br>Importe: <strong>${money(p.amount)}</strong></p><p class="notice">El pago quedará <strong>anulado</strong> y dejará de descontarse del saldo. Las facturas pendientes se recalcularán. Se conserva el historial y el número del recibo no se reutiliza.</p><p>Saldo actual: ${money(balance(p.clientId))}<br>Saldo después de anular: <strong>${money(round(balance(p.clientId)+p.amount))}</strong></p><p class="help">Si ya entregaste el recibo, informá su anulación al cliente. Los PDF descargados anteriormente no se pueden modificar.</p><div class="form-actions"><button id="cancel-void-payment">Cancelar</button><button id="confirm-void-payment" style="background:#a13f2c;color:white">Sí, borrar pago</button></div>`);
  $('#cancel-void-payment').onclick=close;
  $('#confirm-void-payment').onclick=()=>{
    if(owner!==companyId)return;
    const current=db.payments.find(item=>item.id===id);if(!current||current.voidedAt)return;
    if(commit(next=>{next.payments.find(item=>item.id===id).voidedAt=new Date().toISOString();})){close();view='cuentas';render();toast('Pago anulado. Saldo y facturas recalculados.');}
  };
}
function newOrder(id) {
  const original=id?db.orders.find(o=>o.id===id):null;if(id&&!original)return;
  if(!db.clients.length||(!original&&!db.products.length)){toast('Primero cargá al menos un cliente y un producto.');return;}
  const owner=companyId;
  let lines=original?structuredClone(original.lines):[];
  modal('Nuevo pedido',`<form id="order-form"><div class="form-grid"><div class="field"><label for="order-client">Cliente</label><select id="order-client" required><option value="">Seleccionar cliente…</option>${db.clients.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.discount}% dto.</option>`).join('')}</select></div>${field('Fecha','order-date',date(),'date','required')}</div><div class="field"><label for="product-search">Buscar un producto</label><input id="product-search" placeholder="Código o descripción…"><select id="add-product" aria-label="Agregar producto"></select></div><div id="order-lines"></div><div class="order-summary" id="order-summary"></div>${field('Notas del pedido','order-notes')}<div class="form-actions"><button class="primary">Guardar pedido</button></div></form>`);
  const options=()=>{const q=$('#product-search').value.toLowerCase();$('#add-product').innerHTML='<option value="">+ Elegir producto para agregar…</option>'+db.products.filter(p=>`${p.code} ${p.name}`.toLowerCase().includes(q)).map(p=>`<option value="${esc(p.id)}">${esc(p.code)} · ${esc(p.name)} · ${money(p.price)}</option>`).join('');};
  if(original){$('#modal-title').textContent=`${companyNames[companyId]} · Editar pedido #${original.number}`;$('#order-client').value=original.clientId;$('#order-date').value=original.date;$('#order-notes').value=original.notes;$('#order-form').insertAdjacentHTML('afterbegin','<p class="notice">Se conservan los precios y el descuento originales del pedido. Los productos nuevos usan el precio actual del catálogo. Si cambiás de cliente, se aplica el descuento actual del nuevo cliente. Los PDF ya enviados no se modifican: descargá una nueva copia después de guardar.</p>');}
  const totals=()=>{const selected=$('#order-client').value;const discount=original&&selected===original.clientId?original.discount:client(selected)?.discount||0;const subtotal=round(lines.reduce((s,l)=>s+round(l.price*l.qty),0));const discountAmount=round(subtotal*discount/100);return {subtotal,discount,discountAmount,total:round(subtotal-discountAmount)};};
  const summary=()=>{const t=totals();$('#order-summary').innerHTML=`<div class="summary-row"><span>Subtotal de lista</span><span>${money(t.subtotal)}</span></div><div class="summary-row"><span>Descuento del cliente (${t.discount}%)</span><span>− ${money(t.discountAmount)}</span></div><div class="summary-row total"><span>Total</span><span>${money(t.total)}</span></div><p class="help">Este pedido no suma deuda ni genera una factura. Las facturas ya emitidas se cargan por separado en Cuenta corriente.</p>`;};
  const draw=()=>{$('#order-lines').innerHTML=lines.map((l,i)=>`<div class="order-line"><span>${esc(l.name)}</span><input type="number" aria-label="Cantidad de ${esc(l.name)}" min="0.001" step="0.001" value="${l.qty}" data-qty="${i}" required><span class="line-price">${money(l.price)} c/u</span><button type="button" class="icon" data-remove="${i}" aria-label="Quitar ${esc(l.name)}">✕</button></div>`).join('');summary();};
  $('#product-search').oninput=options;options();draw();$('#order-client').onchange=summary;
  $('#add-product').onchange=e=>{const p=db.products.find(p=>p.id===e.target.value);if(!p)return;const existing=lines.find(l=>l.productId===p.id);if(existing)existing.qty++;else lines.push({productId:p.id,code:p.code,name:p.name,price:p.price,qty:1});e.target.value='';draw();};
  $('#order-lines').oninput=e=>{if(e.target.dataset.qty!==undefined){lines[Number(e.target.dataset.qty)].qty=Number(e.target.value);summary();}};
  $('#order-lines').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){lines.splice(Number(b.dataset.remove),1);draw();}};
  $('#order-form').onsubmit=e=>{e.preventDefault();if(owner!==companyId)return;if(original&&!db.orders.some(o=>o.id===original.id))return;if(!client($('#order-client').value))return alert('Seleccioná un cliente.');if(!lines.length)return alert('Agregá al menos un producto.');if(lines.some(l=>!Number.isFinite(l.qty)||l.qty<=0))return alert('Revisá las cantidades.');const t=totals();if(![t.subtotal,t.discountAmount,t.total].every(Number.isFinite))return alert('El importe es demasiado grande.');const record={...(original||{}),id:original?.id||uid(),number:original?.number||Math.max(0,...db.orders.map(o=>o.number))+1,clientId:$('#order-client').value,date:$('#order-date').value,lines:structuredClone(lines),...t,status:original?.status||'Pendiente',notes:$('#order-notes').value.trim()};if(commit(n=>{if(original)n.orders[n.orders.findIndex(o=>o.id===original.id)]=record;else n.orders.push(record);})){close();view='pedidos';render();toast(original?'Pedido actualizado. No afecta la cuenta corriente.':'Pedido guardado. No afecta la cuenta corriente.');}};
}
function showOrder(id) {
  const o=db.orders.find(o=>o.id===id);if(!o)return;
  modal(`Pedido #${o.number}`,`<p><strong>${esc(client(o.clientId)?.name)}</strong> · ${prettyDate(o.date)}</p>${table(['Producto','Cantidad','Precio de lista','Importe'],o.lines.map(l=>`<tr><td>${esc(l.code)} · ${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(round(l.price*l.qty))}</td></tr>`).join(''))}<div class="order-summary"><div class="summary-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="summary-row"><span>Descuento (${o.discount}%)</span><span>− ${money(o.discountAmount)}</span></div><div class="summary-row total"><span>Total</span><span>${money(o.total)}</span></div></div><p>${esc(o.notes)}</p><div class="field"><label for="status">Estado de preparación (no indica si está pagado)</label><select id="status">${['Pendiente','Preparado','Entregado'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></div><div class="actions"><button id="save-status" class="primary">Guardar estado</button><button id="print-order">Imprimir / PDF</button></div>`);
  $('#save-status').onclick=()=>{const status=$('#status').value;if(commit(n=>n.orders.find(x=>x.id===id).status=status)){close();render();toast('Estado actualizado');}};
  $('#print-order').insertAdjacentHTML('beforebegin',`<button class="primary" data-pdf="${esc(id)}">Descargar PDF</button>`);
  $('#print-order').insertAdjacentHTML('beforebegin',`<button data-edit-order="${esc(id)}">Editar pedido</button>`);
  $('#print-order').textContent='Imprimir';$('#print-order').onclick=()=>window.print();
}
let pdfLibrary;
function loadPdfLibrary() {
  if(window.jspdf?.jsPDF)return Promise.resolve(window.jspdf.jsPDF);
  if(!pdfLibrary)pdfLibrary=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='jspdf.umd.min.js';
    const timer=setTimeout(()=>{script.remove();reject(Error('El lector PDF tardó demasiado. Revisá la conexión y volvé a intentar.'));},20000);
    script.onload=()=>{clearTimeout(timer);if(window.jspdf?.jsPDF)resolve(window.jspdf.jsPDF);else reject(Error('No se pudo iniciar el generador PDF.'));};
    script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('No se pudo cargar el generador PDF local. Abrí la app con internet hasta que indique que está lista sin conexión.'));};
    document.head.append(script);
  }).catch(error=>{pdfLibrary=undefined;throw error;});
  return pdfLibrary;
}
function buildOrderPdf(order, customer, company, JsPDF) {
  const doc=new JsPDF({unit:'mm',format:'a4'});
  const text=value=>String(value??'').replace(/[\u00a0\u202f]/g,' ').replace(/\u2212/g,'-');
  const cash=n=>text(money(n));let y=18;
  doc.setProperties({title:`${company} - Pedido ${order.number}`,subject:'Pedido comercial, no válido como factura',author:company});
  const heading=()=>{
    doc.setTextColor(23,62,54);doc.setFont('helvetica','bold');doc.setFontSize(17);
    const companyLines=doc.splitTextToSize(text(company),180);doc.text(companyLines,14,18);y=20+companyLines.length*7;
    doc.setFontSize(12);doc.text(`PEDIDO #${order.number}`,14,y);doc.text(prettyDate(order.date),196,y,{align:'right'});y+=8;
    doc.setTextColor(35,55,47);doc.setFont('helvetica','normal');doc.setFontSize(10);
    const customerLines=doc.splitTextToSize(`Cliente: ${text(customer?.name||'Cliente')}`,182);doc.text(customerLines,14,y);y+=customerLines.length*5+3;
    if(customer?.cuit){doc.text(`CUIT: ${formatCuit(customer.cuit)}`,14,y);y+=5;}
    if(customer?.zone){const zones=doc.splitTextToSize(text(`Zona: ${customer.zone}`),182);doc.text(zones,14,y);y+=zones.length*5;}
    if(customer?.email){const emails=doc.splitTextToSize(text(`Email: ${customer.email}`),182);doc.text(emails,14,y);y+=emails.length*5;}
    doc.setFillColor(237,242,232);doc.rect(14,y-4,182,8,'F');doc.setFont('helvetica','bold');doc.setFontSize(9);
    doc.text('Código / descripción',16,y+1);doc.text('Cant.',105,y+1,{align:'right'});doc.text('Precio lista',148,y+1,{align:'right'});doc.text('Importe',194,y+1,{align:'right'});y+=12;
    doc.setFont('helvetica','normal');
  };
  const page=()=>{doc.addPage();heading();};
  heading();
  for(const line of order.lines){
    const description=doc.splitTextToSize(text(`${line.code} - ${line.name}`),78);let index=0;
    while(index<description.length){
      if(y+6>265)page();const available=Math.max(1,Math.floor((265-y)/4.5));const part=description.slice(index,index+available);
      doc.text(part,14,y);
      if(index===0){doc.setFontSize(8);doc.text(String(line.qty),105,y,{align:'right'});doc.text(cash(line.price),148,y,{align:'right'});doc.text(cash(round(line.price*line.qty)),196,y,{align:'right'});doc.setFontSize(9);}
      y+=part.length*4.5;index+=part.length;if(index<description.length)page();
    }
    doc.setDrawColor(225,230,222);doc.line(14,y,196,y);y+=6;
  }
  if(y+34>270)page();
  doc.setFontSize(10);doc.text('Subtotal de lista',110,y);doc.text(cash(order.subtotal),196,y,{align:'right'});y+=7;
  doc.text(`Descuento (${order.discount}%)`,110,y);doc.text(`- ${cash(order.discountAmount)}`,196,y,{align:'right'});y+=9;
  doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text('TOTAL',110,y);doc.text(cash(order.total),196,y,{align:'right'});y+=12;
  doc.setFont('helvetica','normal');doc.setFontSize(9);
  const notes=doc.splitTextToSize(text(order.notes?`Notas: ${order.notes}`:''),180);
  for(const note of notes){if(y+5>270)page();doc.text(note,14,y);y+=5;}
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);doc.setTextColor(110);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text('Importes en pesos argentinos. Pedido no válido como factura ni recibo de pago.',14,282);doc.text(`${i} / ${pages}`,196,288,{align:'right'});}
  return doc;
}
let orderPdfUrl;
function presentPdf(doc,filename,title) {
  const blob=doc.output('blob');
  if(orderPdfUrl)URL.revokeObjectURL(orderPdfUrl);orderPdfUrl=URL.createObjectURL(blob);
  modal(title,`<p>El PDF está listo. Tocá <strong>Abrir PDF</strong> y, en el iPad, usá <strong>Compartir → Guardar en Archivos</strong> o WhatsApp.</p><div class="actions"><a class="primary" style="display:inline-block;padding:13px 18px;border-radius:9px;text-decoration:none" href="${esc(orderPdfUrl)}" target="_blank" rel="noopener">Abrir PDF</a><a style="display:inline-block;padding:13px 18px;border:1px solid #d5ded5;border-radius:9px;color:#173e36;text-decoration:none" href="${esc(orderPdfUrl)}" download="${esc(filename)}">Guardar PDF</a><button id="share-order-pdf" hidden>Compartir PDF</button></div>`);
  const file=new File([blob],filename,{type:'application/pdf'});
  if(navigator.canShare?.({files:[file]})){$('#share-order-pdf').hidden=false;$('#share-order-pdf').onclick=()=>navigator.share({files:[file],title}).catch(error=>{if(error.name!=='AbortError')alert('No se pudo compartir. Usá Abrir PDF o Guardar PDF.');});}
}
function buildReceiptPdf(payment,customer,company,JsPDF) {
  const doc=new JsPDF({unit:'mm',format:'a4'}),r=payment.receipt;
  const text=value=>String(value??'').replace(/[\u00a0\u202f]/g,' ').replace(/\u2212/g,'-');let y=20;
  const write=(value,size=11,bold=false)=>{
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
    for(const line of doc.splitTextToSize(text(value),180)){if(y>267){doc.addPage();y=20;}doc.text(line,15,y);y+=size*.5+2;}
  };
  const title=(payment.voidedAt?'ANULADO - ':'')+(r?`RECIBO DE PAGO N° ${r.number}`:'CONSTANCIA DE PAGO REGISTRADO');
  doc.setProperties({title:`${company} - ${title}`,author:company,subject:'Cuenta corriente - comprobante no fiscal'});
  write(company,20,true);write(title,15,true);write(`Fecha del pago: ${prettyDate(payment.date)}`);
  if(payment.voidedAt)write(`PAGO ANULADO el ${new Date(payment.voidedAt).toLocaleString('es-AR')}. Este documento NO acredita un pago vigente.`,12,true);
  write(`Cliente: ${r?.clientName||customer.name||'Cliente'}`,12,true);
  const customerCuit=r?r.clientCuit:customer.cuit,customerZone=r?r.clientZone:customer.zone;
  if(customerCuit)write(`CUIT: ${formatCuit(customerCuit)}`);if(customerZone)write(`Zona: ${customerZone}`);
  const customerEmail=r?r.clientEmail:customer.email;if(customerEmail)write(`Email: ${customerEmail}`);
  const phone=r?r.clientPhone:customer.phone,address=r?r.clientAddress:customer.address;
  if(phone)write(`Teléfono: ${phone}`);if(address)write(`Dirección: ${address}`);y+=5;
  write(`Importe recibido: ${money(payment.amount)}`,15,true);
  if(r?.tenders?.length){
    y+=4;write('MEDIOS DE PAGO RECIBIDOS',12,true);
    r.tenders.forEach((t,i)=>{write(`${i+1}. ${t.method}: ${money(t.amount)}`,11,true);if(t.reference)write(`Número / referencia: ${t.reference}`,10);if(t.bank)write(`Banco: ${t.bank}`,10);if(t.due)write(`Vencimiento: ${prettyDate(t.due)}`,10);});
    write(`TOTAL RECIBIDO: ${money(payment.amount)}`,12,true);
  }
  if(payment.note)write(`Detalle / medio de pago: ${payment.note}`);
  if(r?.applications?.length){
    y+=5;write('DETALLE DE APLICACIÓN DEL PAGO',12,true);
    for(const application of r.applications){
      if(application.type==='invoice'){
        write(`Factura ${application.number}`,11,true);
        write(`Total factura: ${money(application.invoiceAmount)} | Aplicado en este pago: ${money(application.amount)}`,10);
        write(`Pendiente de esta factura después del pago: ${money(application.pendingAfter)}`,10);
      }else write(`${application.number}: ${money(application.amount)}`,10);
      y+=2;
    }
    write(`Total aplicado: ${money(r.applications.reduce((sum,a)=>sum+a.amount,0))}`,11,true);
  }
  y+=6;
  if(r){write(`Saldo anterior: ${money(r.balanceBefore)}`,12);write(`Pago recibido: - ${money(payment.amount)}`,12);write(`Saldo restante: ${money(r.balanceAfter)}`,14,true);write('Saldo positivo: pendiente de cobro. Saldo negativo: a favor del cliente.',9);write('Saldos al momento de registrar el pago; no cambian al cargar movimientos posteriores.',9);}
  else write('Pago anterior a la función de recibos. No se dispone de los saldos históricos al registrarlo; esta copia acredita únicamente el pago registrado.',10);
  write('Pago a cuenta corriente. No emite una factura ni modifica pedidos.',10);
  if(r)write(`Registrado: ${new Date(r.issuedAt).toLocaleString('es-AR')}`,9);
  write(`Referencia de pago: ${payment.id}`,8);
  const count=doc.getNumberOfPages();for(let i=1;i<=count;i++){doc.setPage(i);doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text(payment.voidedAt?'ANULADO - Este documento no acredita un pago vigente.':'Comprobante interno de pago. No válido como factura fiscal. Importes en pesos argentinos.',15,281);doc.text(`${i} / ${count}`,195,288,{align:'right'});}
  return doc;
}
async function downloadReceiptPdf(id,button) {
  const payment=db.payments.find(p=>p.id===id);if(!payment)return;
  const snapshot=structuredClone(payment),customer=structuredClone(client(payment.clientId)||{}),company=payment.receipt?.companyName||companyNames[companyId];
  const original=button?.textContent;if(button){button.disabled=true;button.textContent='Preparando…';}
  try{const JsPDF=await loadPdfLibrary();const doc=buildReceiptPdf(snapshot,customer,company,JsPDF);const safeCompany=company.replace(/[^a-zA-Z0-9_-]/g,'-');presentPdf(doc,`${safeCompany}-recibo-${snapshot.receipt?.number||snapshot.id}.pdf`,'Recibo de cuenta corriente');}
  catch(error){alert(`No se pudo generar el recibo. ${error.message}`);}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
async function downloadOrderPdf(id,button) {
  const order=db.orders.find(o=>o.id===id);if(!order)return;
  const snapshot=structuredClone(order),customer=structuredClone(client(order.clientId)||{}),company=companyNames[companyId];
  const original=button?.textContent;if(button){button.disabled=true;button.textContent='Preparando…';}
  try{
    const JsPDF=await loadPdfLibrary();const doc=buildOrderPdf(snapshot,customer,company,JsPDF);
    const safeCompany=company.replace(/[^a-zA-Z0-9_-]/g,'-');
    const filename=`${safeCompany}-pedido-${snapshot.number}.pdf`;
    presentPdf(doc,filename,`PDF del pedido #${snapshot.number}`);
  }catch(error){alert(`No se pudo generar el PDF. ${error.message}`);}
  finally{if(button){button.disabled=false;button.textContent=original;}}
}
function download(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=`empresa-${companyId}-${name}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function renderData(root) {
  root.innerHTML=`<div class="notice">Los datos se guardan solo en este navegador, no en la nube. Borrar sus datos elimina la información de la app. Descargá un respaldo seguido y guardalo en Archivos.</div><div class="grid"><section class="panel"><h2>Importar desde Excel</h2><p>Productos con código, descripción y precio. Clientes con teléfono, dirección, descuento y saldo inicial. Sin stock.</p><div class="field"><label for="import-type">¿Qué vas a importar?</label><select id="import-type"><option value="products">Productos</option><option value="clients">Clientes</option></select></div><label class="file-button">Elegir Excel o CSV<input id="import-file" type="file" accept=".xlsx,.xls,.csv"></label><p class="help">Elegí una hoja y asociá sus columnas antes de confirmar. Los productos se actualizan por código. Los clientes se actualizan por nombre exacto, sin distinguir mayúsculas; usá nombres únicos.</p><button id="template">Descargar plantilla CSV</button><p class="help">Excel (.xlsx/.xls) requiere conexión para cargar el lector. CSV funciona sin esa biblioteca.</p></section><section class="panel"><h2>Respaldo completo</h2><p>Incluye clientes, descuentos, productos, pedidos y pagos.</p><div class="stack"><button id="backup" class="primary">Descargar respaldo (.json)</button><label class="file-button">Restaurar respaldo<input id="restore" type="file" accept=".json"></label></div><p class="help">Restaurar reemplaza todos los datos actuales, con confirmación previa.</p></section></div>`;
  $('#backup').onclick=()=>download(`ferreteria-respaldo-${date()}.json`,JSON.stringify(db,null,2),'application/json');
  $('#backup').insertAdjacentHTML('beforebegin','<p class="help">El respaldo también incluye facturas y recibos. Los PDF, las importaciones y los respaldos se pueden generar sin conexión una vez preparada la app. Para enviar por WhatsApp o correo necesitás conexión.</p>');
  $('#content').querySelectorAll('.help').forEach(p=>{if(p.textContent.includes('lector. CSV funciona'))p.textContent='Excel y CSV funcionan sin internet cuando la app indica «Lista para usar sin conexión».';});
  $('#template').onclick=()=>{const products=$('#import-type').value==='products';download(products?'plantilla-productos.csv':'plantilla-clientes.csv','\uFEFF'+(products?'codigo;descripcion;precio\r\nTOR001;Tornillo 6 mm;150,50\r\n':'nombre;cuit;zona;email;telefono;direccion;descuento;saldo\r\nCliente ejemplo;;Centro;cliente@ejemplo.com;1123456789;Calle 123;10;0\r\n'),'text/csv;charset=utf-8');};
  $('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const type=$('#import-type').value;try{if(/\.csv$/i.test(file.name)){const text=await file.text();mapImport(type,parseCSV(text));}else{if(!globalThis.XLSX)throw Error('No se cargó el lector local de Excel. Conectate y prepará la app para uso sin conexión, o usá CSV.');const book=XLSX.read(await file.arrayBuffer(),{type:'array'});chooseSheet(type,book);}}catch(err){alert(`No se pudo abrir el archivo: ${err.message}`);}finally{e.target.value='';}};
  $('#restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const next=JSON.parse(await file.text());validateBackup(next);next.invoices ??= [];if(!confirm(`Se reemplazarán TODOS los datos de esta empresa por ${next.clients.length} clientes, ${next.products.length} productos, ${next.orders.length} pedidos, ${next.invoices.length} facturas y ${next.payments.length} pagos. ¿Continuar?`))return;const blocked=storageBlocked;storageBlocked=false;if(persist(next)){$('#storage-warning').hidden=true;render();toast('Respaldo restaurado');}else storageBlocked=blocked;}catch(err){alert(`Respaldo no válido: ${err.message}`);}finally{e.target.value='';}};
}
function parseCSV(text) {
  text=text.replace(/^\uFEFF/,'');const first=text.split(/\r?\n/)[0];const delimiter=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===delimiter&&!quoted){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);rows.push(row);row=[];cell='';}else cell+=c;}
  if(quoted)throw Error('Hay comillas sin cerrar en el CSV.');if(cell||row.length){row.push(cell);rows.push(row);}return rows.filter(r=>r.some(v=>String(v).trim()));
}
function chooseSheet(type,book) {modal('Elegir hoja de Excel',`<div class="field"><label for="sheet">Hoja</label><select id="sheet">${book.SheetNames.map((s,i)=>`<option value="${i}">${esc(s)}</option>`).join('')}</select></div><button class="primary" id="select-sheet">Continuar</button>`);$('#select-sheet').onclick=()=>mapImport(type,XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[Number($('#sheet').value)]],{header:1,defval:'',raw:true}).filter(r=>r.some(v=>String(v).trim())));}
const normalize=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[_\s]+/g,' ');
function parseNumber(value,defaultValue=0) {if(value===''||value==null)return defaultValue;if(typeof value==='number')return value;let s=String(value).trim().replace(/[$%\s]/g,'');if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');if(!/^[+-]?\d+(\.\d+)?$/.test(s))return NaN;return Number(s);}
function mapImport(type,rows) {
  // Lista Bonfigli: títulos arriba, A = código, B = descripción, F = pesos.
  if(type==='products' && rows.slice(0,8).some(r=>normalize(r[5]||'')==='precio de lista en pesos')){
    rows=[['codigo','descripcion','precio'],...rows.filter(r=>String(r[0]??'').trim() && String(r[1]??'').trim()).map(r=>[r[0],r[1],r[5]])];
  }
  // Lista Dimafe: filas de título, encabezado en A/B/D y marca en F.
  if(type==='products'){
    const header=rows.slice(0,20).findIndex(r=>normalize(r[0]||'')==='codigo' && normalize(r[1]||'')==='descripcion' && normalize(r[3]||'')==='precio');
    if(header>=0)rows=[['codigo','descripcion','precio'],...rows.slice(header+1).filter(r=>String(r[0]??'').trim() && String(r[1]??'').trim()).map(r=>[r[0],r[1],r[3]])];
  }
  if(rows.length<2)throw Error('El archivo necesita una fila de encabezados y al menos una fila de datos.');
  const headers=rows[0].map(String);
  const fields=type==='products'?[['code','Código *',['codigo','cod','sku']],['name','Descripción *',['descripcion','producto','nombre']],['price','Precio *',['precio','precio de lista','precio lista']]]:[['name','Nombre *',['nombre','cliente','razon social']],['cuit','CUIT',['cuit','cuit/cuil','cuit cuil']],['zone','Zona',['zona','region','sector']],['email','Email',['email','e-mail','mail','correo','correo electronico']],['phone','Teléfono',['telefono','celular']],['address','Dirección',['direccion','domicilio']],['discount','Descuento %',['descuento','descuento %','dto']],['opening','Saldo inicial',['saldo','saldo inicial','deuda']]];
  modal('Asociar columnas',`<p>Se detectaron <strong>${rows.length-1} filas</strong>. La primera fila se usa como encabezado.</p><div class="mapping">${fields.map(([key,label,aliases])=>{const found=headers.findIndex(h=>aliases.includes(normalize(h)));return `<div class="field"><label for="map-${key}">${label}</label><select id="map-${key}"><option value="">No importar</option>${headers.map((h,i)=>`<option value="${i}" ${i===found?'selected':''}>${esc(h||`Columna ${i+1}`)}</option>`).join('')}</select></div>`;}).join('')}</div><p class="help">Vista de las primeras filas:</p>${table(headers.map(esc),rows.slice(1,4).map(r=>`<tr>${headers.map((_,i)=>`<td>${esc(r[i])}</td>`).join('')}</tr>`).join(''))}<p class="notice">Los números con coma se interpretan con formato argentino: 1.250,50. Si no asociás una columna opcional, el valor existente se conserva. El descuento debe estar expresado entre 0 y 100 (10 significa 10%).</p><button id="check-import" class="primary">Revisar importación</button>`);
  $('#check-import').onclick=()=>{
    const mapping=Object.fromEntries(fields.map(([key])=>[key,$(`#map-${key}`).value]));
    const required=type==='products'?['code','name','price']:['name'];if(required.some(k=>mapping[k]===''))return alert('Asociá todas las columnas obligatorias (*).');
    const assigned=Object.values(mapping).filter(v=>v!=='');if(new Set(assigned).size!==assigned.length)return alert('Cada campo debe usar una columna diferente.');
    const next=structuredClone(db);let added=0,updated=0;const errors=[];const seen=new Set();const usedProducts=new Set();const skipped=[];
    rows.slice(1).forEach((r,i)=>{const get=k=>mapping[k]===''?'':r[Number(mapping[k])]??'';const name=String(get('name')).trim();const key=String(type==='products'?get('code'):name).trim();if(!name||!key){errors.push(`Fila ${i+2}: faltan nombre o código.`);return;}const matchKey=key.toLowerCase();if(type==='clients' && seen.has(matchKey)){errors.push(`Fila ${i+2}: ${key} está repetido en el archivo.`);return;}seen.add(matchKey);
      if(type==='products' && ['','-'].includes(String(get('price')).trim())){skipped.push(`${key} · ${name}`);return;}
      const list=next[type];const existing=type==='products'?list.find(x=>x.code.toLowerCase()===matchKey && !usedProducts.has(x.id)):list.find(x=>x.name.toLowerCase()===matchKey);
      const record=existing?{...existing}:type==='products'?{id:uid(),code:key,name,price:0}:{id:uid(),name,cuit:'',zone:'',email:'',phone:'',address:'',discount:0,opening:0,notes:'',followup:''};record.name=name;
      if(type==='products'){record.code=key;record.price=round(parseNumber(get('price'),NaN));if(!Number.isFinite(record.price)||record.price<0){errors.push(`Fila ${i+2}: precio inválido.`);return;}}
      else{for(const k of ['phone','address','zone','email'])if(mapping[k]!=='')record[k]=String(get(k)).trim();if(!validEmail(record.email||'')){errors.push(`Fila ${i+2}: email inválido.`);return;}if(mapping.cuit!=='')record.cuit=cuitDigits(get('cuit'));if(!validCuit(record.cuit||'')||(record.zone||'').length>100){errors.push(`Fila ${i+2}: CUIT debe tener 11 dígitos o quedar vacío; zona admite hasta 100 caracteres.`);return;}for(const k of ['discount','opening'])if(mapping[k]!=='')record[k]=round(parseNumber(get(k)));if(!Number.isFinite(record.discount)||record.discount<0||record.discount>100||!Number.isFinite(record.opening)){errors.push(`Fila ${i+2}: descuento o saldo inválido.`);return;}}
      if(type==='products')usedProducts.add(record.id);
      if(existing){list[list.indexOf(existing)]=record;updated++;}else{list.push(record);added++;}
    });
    if(errors.length)return alert(`No se importó nada. Corregí los siguientes errores:\n${errors.slice(0,15).join('\n')}${errors.length>15?'\nHay más errores…':''}`);
    modal('Confirmar importación',`<p><strong>${added}</strong> registros nuevos y <strong>${updated}</strong> actualizaciones.</p><p>Los pedidos anteriores conservarán sus precios y descuentos.</p>${type==='products'?'<p class="help">Los códigos repetidos se conservan como productos separados, en el orden del archivo. Al actualizar, mantené ese orden. Los precios se guardan en pesos, con dos decimales, sin conversión ni IVA adicional.</p>':''}${skipped.length?`<div class="notice"><strong>${skipped.length} fila(s) sin precio se omitirán; no se cargarán a $0.</strong><ul>${skipped.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`:''}${type==='clients'?'<p class="notice">Si asociás saldo inicial, se reemplaza ese saldo de los clientes existentes. No importes un saldo actual que ya incluya pedidos registrados en esta app.</p>':''}<div class="form-actions"><button id="confirm-import" class="primary">Confirmar importación</button></div>`);$('#confirm-import').onclick=()=>{if(persist(next)){close();view=type==='products'?'productos':'clientes';render();toast('Importación completada');}};
  };
}
function validTenders(tenders,amount) {
  return Array.isArray(tenders)&&tenders.length>0&&tenders.length<=50&&Number.isSafeInteger(Math.round(amount*100))&&amount>0&&tenders.every(t=>t&&PAYMENT_METHODS.includes(t.method)&&typeof t.amount==='number'&&Number.isFinite(t.amount)&&t.amount>0&&Math.abs(round(t.amount)-t.amount)<.001&&typeof t.reference==='string'&&t.reference.length<=150&&(!['eCheq','Cheque'].includes(t.method)||t.reference.trim())&&typeof t.bank==='string'&&t.bank.length<=100&&typeof t.due==='string'&&(!t.due||(/^\d{4}-\d{2}-\d{2}$/.test(t.due)&&!Number.isNaN(new Date(t.due+'T12:00:00').getTime()))))&&Math.abs(round(tenders.reduce((sum,t)=>sum+t.amount,0))-amount)<.001;
}
function validateBackup(data) {
  const fail=()=>{throw Error('Estructura de datos incorrecta.');};const finite=n=>typeof n==='number'&&Number.isFinite(n);const text=v=>typeof v==='string';const validDate=d=>text(d)&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(new Date(d+'T12:00:00').getTime());
  if(!data||!['clients','products','orders','payments'].every(k=>Array.isArray(data[k])))fail();
  if(data.invoices!==undefined&&!Array.isArray(data.invoices))fail();
  for(const key of ['clients','products','orders','payments','invoices']){const ids=new Set();for(const item of data[key]||[]){if(!item||!text(item.id)||!item.id||ids.has(item.id))fail();ids.add(item.id);}}
  for(const c of data.clients)if(!text(c.name)||!c.name.trim()||!['phone','address','notes','followup'].every(k=>text(c[k]))||!finite(c.discount)||c.discount<0||c.discount>100||!finite(c.opening))fail();
  for(const c of data.clients)if((c.cuit!==undefined&&(!text(c.cuit)||!validCuit(c.cuit)))||(c.zone!==undefined&&(!text(c.zone)||c.zone.length>100)))fail();
  for(const c of data.clients)if(c.email!==undefined&&(!text(c.email)||!validEmail(c.email)))fail();
  for(const p of data.products)if(!text(p.code)||!text(p.name)||!finite(p.price)||p.price<0)fail();
  const clients=new Set(data.clients.map(c=>c.id));const numbers=new Set();
  for(const o of data.orders){if(!clients.has(o.clientId)||!validDate(o.date)||!Number.isInteger(o.number)||o.number<1||numbers.has(o.number)||!['Pendiente','Preparado','Entregado'].includes(o.status)||!text(o.notes)||!Array.isArray(o.lines)||!o.lines.length||!['subtotal','discount','discountAmount','total'].every(k=>finite(o[k])&&o[k]>=0)||o.discount>100)fail();numbers.add(o.number);for(const l of o.lines)if(!text(l.name)||!text(l.code)||!text(l.productId)||!finite(l.qty)||l.qty<=0||!finite(l.price)||l.price<0)fail();const subtotal=round(o.lines.reduce((s,l)=>s+round(l.qty*l.price),0));if(Math.abs(subtotal-o.subtotal)>.001||Math.abs(round(subtotal*o.discount/100)-o.discountAmount)>.001||Math.abs(round(subtotal-o.discountAmount)-o.total)>.001)fail();}
  for(const p of data.payments)if(!clients.has(p.clientId)||!finite(p.amount)||p.amount<=0||!validDate(p.date)||!text(p.note))fail();
  for(const p of data.payments)if(p.voidedAt!==undefined&&(!text(p.voidedAt)||!p.voidedAt||Number.isNaN(new Date(p.voidedAt).getTime())))fail();
  for(const p of data.payments)if(p.receipt?.tenders!==undefined&&!validTenders(p.receipt.tenders,p.amount))fail();
  const receiptNumbers=new Set();
  for(const p of data.payments){if(p.receipt===undefined)continue;const r=p.receipt;if(!r||!Number.isInteger(r.number)||r.number<1||receiptNumbers.has(r.number)||!finite(r.balanceBefore)||!finite(r.balanceAfter)||Math.abs(round(r.balanceBefore-p.amount)-r.balanceAfter)>.001||!['issuedAt','companyName','clientName','clientPhone','clientAddress'].every(k=>text(r[k]))||Number.isNaN(new Date(r.issuedAt).getTime()))fail();receiptNumbers.add(r.number);}
  for(const p of data.payments){const r=p.receipt;if(r&&((r.clientCuit!==undefined&&(!text(r.clientCuit)||!validCuit(r.clientCuit)))||(r.clientZone!==undefined&&(!text(r.clientZone)||r.clientZone.length>100))))fail();}
  for(const p of data.payments){const r=p.receipt;if(r?.clientEmail!==undefined&&(!text(r.clientEmail)||!validEmail(r.clientEmail)))fail();}
  for(const p of data.payments){const applications=p.receipt?.applications;if(applications===undefined)continue;if(!Array.isArray(applications)||!applications.length)fail();for(const a of applications){if(!a||!['invoice','opening','advance'].includes(a.type)||!text(a.number)||!a.number.trim()||!finite(a.amount)||a.amount<=0)fail();if(a.type==='invoice'&&(!text(a.invoiceId)||!a.invoiceId||!finite(a.invoiceAmount)||a.invoiceAmount<=0||!finite(a.pendingAfter)||a.pendingAfter<0||a.pendingAfter>a.invoiceAmount||a.amount>a.invoiceAmount))fail();}if(Math.abs(round(applications.reduce((sum,a)=>sum+a.amount,0))-p.amount)>.001)fail();}
  const invoiceKeys=new Set();
  for(const i of data.invoices||[]){if(!clients.has(i.clientId)||!text(i.number)||!i.number.trim()||!finite(i.amount)||i.amount<=0||!validDate(i.date)||!validDate(i.due)||i.due<i.date||!text(i.notes))fail();const key=JSON.stringify([i.clientId,i.number.trim().toLowerCase()]);if(invoiceKeys.has(key))fail();invoiceKeys.add(key);}
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.view){view=b.dataset.view;render();}
  if(b.dataset.client)showClient(b.dataset.client);
  if(b.dataset.editClient)editClient(b.dataset.editClient);
  if(b.dataset.product)editProduct(b.dataset.product);
  if(b.dataset.payment)payment(b.dataset.payment);
  if(b.dataset.order)showOrder(b.dataset.order);
  if(b.dataset.editOrder)newOrder(b.dataset.editOrder);
  if(b.dataset.pdf)downloadOrderPdf(b.dataset.pdf,b);
  if(b.dataset.receipt)downloadReceiptPdf(b.dataset.receipt,b);
  if(b.dataset.statement)downloadStatementPdf(b.dataset.statement,b);
  if(b.dataset.voidPayment)voidPayment(b.dataset.voidPayment);
  if(b.dataset.invoice)editInvoice(b.dataset.invoice);
  if(b.dataset.action==='invoice')editInvoice();
  if(b.dataset.action==='account-payment')chooseAccountPayment();
  const action=b.dataset.action;if(action==='client')editClient();if(action==='product')editProduct();if(action==='import'){view='datos';render();}if(action==='orders'){view='pedidos';render();}
});
$('#company-select').onchange=e=>{close();companyId=e.target.value;KEY=companyId==='1'?'ferreteria-crm-v1':'ferreteria-crm-v1-company-2';savePreferences();loadCompany();render();toast(`Empresa activa: ${companyNames[companyId]}`);};
$('#rename-company').onclick=()=>{modal('Nombre de la empresa',`<form id="company-form">${field('Nombre','company-name',companyNames[companyId],'text','required maxlength="80"')}<div class="form-actions"><button class="primary">Guardar nombre</button></div></form>`);$('#company-form').onsubmit=e=>{e.preventDefault();const name=$('#company-name').value.trim();if(!name)return;companyNames[companyId]=name;savePreferences();close();for(const option of $('#company-select').options)option.textContent=companyNames[option.value];document.title=`${name} · CRM`;render();};};
$('#new-order').onclick=()=>newOrder();$('#close-modal').onclick=close;
$('#today').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
render();
