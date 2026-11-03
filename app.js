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
let db = {clients:[],products:[],orders:[],payments:[]};
let view = 'panel';
let storageBlocked = false;
function loadCompany() {
  db={clients:[],products:[],orders:[],payments:[]};storageBlocked=false;$('#storage-warning').hidden=true;
  try { const raw = localStorage.getItem(KEY); if (raw) { const data = JSON.parse(raw); validateBackup(data); db = data; } else if (window.INITIAL_CATALOGS?.[companyId]) { db.products=structuredClone(window.INITIAL_CATALOGS[companyId].products); localStorage.setItem(KEY,JSON.stringify(db)); } }
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
function balance(id) { return round((client(id)?.opening || 0) + db.orders.filter(o => o.clientId === id).reduce((s,o) => s + o.total,0) - db.payments.filter(p => p.clientId === id).reduce((s,p) => s+p.amount,0)); }
function field(label, name, value = '', type = 'text', extra = '') { return `<div class="field"><label for="${name}">${label}</label><input id="${name}" name="${name}" type="${type}" value="${esc(value)}" ${extra}></div>`; }
function table(headers, rows, empty = 'Todavía no hay registros.') { return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows || `<tr><td colspan="${headers.length}" class="empty">${empty}</td></tr>`}</tbody></table></div>`; }
function clientButton(c) { return `<button class="link" data-client="${esc(c.id)}">${esc(c.name)}</button>`; }
function orderRows(orders) { return orders.map(o=>`<tr><td><button class="link" data-order="${esc(o.id)}">#${esc(o.number)}</button></td><td>${esc(client(o.clientId)?.name || 'Cliente')}</td><td>${prettyDate(o.date)}</td><td>${money(o.total)}</td><td><span class="badge ${o.status==='Pendiente'?'pending':''}">${esc(o.status)}</span></td></tr>`).join(''); }
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
  if (view === 'clientes' || view === 'cuentas') {
    root.innerHTML = `<section class="panel"><div class="toolbar"><input id="search" placeholder="Buscar por nombre o teléfono…" aria-label="Buscar clientes"><button data-action="client">+ Nuevo cliente</button></div><div id="results"></div></section>`;
    const update = () => { const q = $('#search').value.toLowerCase(); const clients = db.clients.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(q)); $('#results').innerHTML = table(['Cliente','Teléfono','Descuento','Saldo',''],clients.map(c=>`<tr><td>${clientButton(c)}</td><td>${esc(c.phone || '—')}</td><td><span class="badge">${c.discount}%</span></td><td>${money(balance(c.id))}</td><td><button class="link" data-payment="${esc(c.id)}">Registrar pago</button></td></tr>`).join(''),'Agregá tu primer cliente o importalo desde Excel.'); }; $('#search').oninput = update; update();
  }
  if (view === 'productos') {
    root.innerHTML = `<section class="panel"><div class="toolbar"><input id="search" placeholder="Buscar por código o descripción…" aria-label="Buscar productos"><button data-action="product">+ Nuevo producto</button></div><div id="results"></div></section>`;
    const update = () => { const q = $('#search').value.toLowerCase(); $('#results').innerHTML = table(['Código','Descripción','Precio de lista',''],db.products.filter(p=>`${p.code} ${p.name}`.toLowerCase().includes(q)).map(p=>`<tr><td>${esc(p.code)}</td><td>${esc(p.name)}</td><td>${money(p.price)}</td><td><button class="link" data-product="${esc(p.id)}">Editar</button></td></tr>`).join(''),'Cargá tus productos a mano o importá tu lista de Excel.'); }; $('#search').oninput = update; update();
  }
  if (view === 'pedidos') root.innerHTML = `<section class="panel"><h2>Todos los pedidos</h2>${table(['Pedido','Cliente','Fecha','Total','Estado'],orderRows(db.orders.slice().reverse()))}</section>`;
  if (view === 'datos') renderData(root);
  const omitted=window.INITIAL_CATALOGS?.[companyId]?.omitted;
  if(view==='productos' && omitted?.length)root.insertAdjacentHTML('afterbegin',`<details class="notice"><summary>${omitted.length} producto(s) de la lista original sin precio, no cargados</summary><ul>${omitted.map(p=>`<li>${esc(p.code)} · ${esc(p.name)}</li>`).join('')}</ul></details>`);
}
function editClient(id) {
  const c = client(id) || {name:'',phone:'',address:'',discount:0,opening:0,notes:'',followup:''};
  modal(id?'Editar cliente':'Nuevo cliente',`<form id="client-form"><div class="form-grid">${field('Nombre *','name',c.name,'text','required maxlength="150"')}${field('Teléfono','phone',c.phone,'tel')}${field('Dirección','address',c.address)}${field('Descuento personal (%)','discount',c.discount,'number','required min="0" max="100" step="0.01"')}${field('Saldo inicial ($)','opening',c.opening,'number','required step="0.01"')}${field('Recordatorio de seguimiento','followup',c.followup,'date')}</div><div class="field"><label for="notes">Notas</label><textarea id="notes" name="notes">${esc(c.notes)}</textarea></div><p class="help">El saldo inicial es la deuda anterior a usar esta app; un valor negativo representa saldo a favor. El descuento solo afecta pedidos nuevos.</p><div class="form-actions"><button class="primary">Guardar cliente</button></div></form>`);
  $('#client-form').onsubmit = e => { e.preventDefault(); const f = new FormData(e.target); const record = {id:id||uid(),name:f.get('name').trim(),phone:f.get('phone').trim(),address:f.get('address').trim(),discount:Number(f.get('discount')),opening:round(Number(f.get('opening'))),notes:f.get('notes').trim(),followup:f.get('followup')}; if (!record.name) return; if(commit(n=> {const i=n.clients.findIndex(x=>x.id===id); if(i<0)n.clients.push(record);else n.clients[i]=record;})) {close();render();toast('Cliente guardado');} };
}
function showClient(id) {
  const c = client(id); if(!c)return;
  const movements = [...db.orders.filter(o=>o.clientId===id).map(o=>({date:o.date,detail:`Pedido #${o.number}`,amount:o.total})),...db.payments.filter(p=>p.clientId===id).map(p=>({date:p.date,detail:`Pago · ${p.note||'Sin detalle'}`,amount:-p.amount}))].sort((a,b)=>a.date.localeCompare(b.date));
  modal(c.name,`<div class="actions"><span class="badge">Descuento: ${c.discount}%</span><button data-edit-client="${esc(id)}">Editar cliente</button><button class="primary" data-payment="${esc(id)}">Registrar pago</button></div><p>${esc(c.phone)}${c.address?` · ${esc(c.address)}`:''}</p><p class="muted">${esc(c.notes)}</p>${c.followup?`<p class="notice">Seguimiento: ${prettyDate(c.followup)}</p>`:''}<small>SALDO ACTUAL · positivo: debe / negativo: a favor</small><div class="balance">${money(balance(id))}</div>${table(['Fecha','Movimiento','Importe'],`<tr><td>—</td><td>Saldo inicial</td><td>${money(c.opening)}</td></tr>`+movements.map(m=>`<tr><td>${prettyDate(m.date)}</td><td>${esc(m.detail)}</td><td>${money(m.amount)}</td></tr>`).join(''))}`);
}
function editProduct(id) {
  const p = db.products.find(p=>p.id===id) || {code:'',name:'',price:0};
  modal(id?'Editar producto':'Nuevo producto',`<form id="product-form">${field('Código *','code',p.code,'text','required')}${field('Descripción *','name',p.name,'text','required')}${field('Precio de lista ($) *','price',p.price,'number','required min="0" step="0.01"')}<div class="form-actions"><button class="primary">Guardar producto</button></div></form>`);
  $('#product-form').onsubmit = e => {e.preventDefault(); const f=new FormData(e.target);const record={id:id||uid(),code:f.get('code').trim(),name:f.get('name').trim(),price:round(Number(f.get('price')))};if(!record.name||!record.code)return;if(record.code.toLowerCase()!==p.code.toLowerCase() && db.products.some(p=>p.id!==id&&p.code.toLowerCase()===record.code.toLowerCase()))return alert('Ese código ya existe.');if(commit(n=>{const i=n.products.findIndex(x=>x.id===id);if(i<0)n.products.push(record);else n.products[i]=record;})){close();render();toast('Producto guardado');}};
}
function payment(id) {
  const c=client(id);if(!c)return;
  modal(`Registrar pago · ${c.name}`,`<p>Saldo actual: <strong>${money(balance(id))}</strong></p><form id="payment-form"><div class="form-grid">${field('Importe recibido ($)','amount','','number','required min="0.01" step="0.01"')}${field('Fecha','date',date(),'date','required')}</div>${field('Detalle / medio de pago','note','','text','placeholder="Transferencia, efectivo…"')}<div class="form-actions"><button class="primary">Guardar pago</button></div></form>`);
  $('#payment-form').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const amount=round(Number(f.get('amount')));if(!Number.isFinite(amount)||amount<=0)return;if(commit(n=>n.payments.push({id:uid(),clientId:id,amount,date:f.get('date'),note:f.get('note').trim()}))){close();render();toast('Pago registrado');}};
}
function newOrder() {
  if(!db.clients.length||!db.products.length){toast('Primero cargá al menos un cliente y un producto.');return;}
  let lines=[];
  modal('Nuevo pedido',`<form id="order-form"><div class="form-grid"><div class="field"><label for="order-client">Cliente</label><select id="order-client" required><option value="">Seleccionar cliente…</option>${db.clients.map(c=>`<option value="${esc(c.id)}">${esc(c.name)} · ${c.discount}% dto.</option>`).join('')}</select></div>${field('Fecha','order-date',date(),'date','required')}</div><div class="field"><label for="product-search">Buscar un producto</label><input id="product-search" placeholder="Código o descripción…"><select id="add-product" aria-label="Agregar producto"></select></div><div id="order-lines"></div><div class="order-summary" id="order-summary"></div>${field('Notas del pedido','order-notes')}<div class="form-actions"><button class="primary">Guardar pedido</button></div></form>`);
  const options=()=>{const q=$('#product-search').value.toLowerCase();$('#add-product').innerHTML='<option value="">+ Elegir producto para agregar…</option>'+db.products.filter(p=>`${p.code} ${p.name}`.toLowerCase().includes(q)).map(p=>`<option value="${esc(p.id)}">${esc(p.code)} · ${esc(p.name)} · ${money(p.price)}</option>`).join('');};
  const totals=()=>{const discount=client($('#order-client').value)?.discount||0;const subtotal=round(lines.reduce((s,l)=>s+round(l.price*l.qty),0));const discountAmount=round(subtotal*discount/100);return {subtotal,discount,discountAmount,total:round(subtotal-discountAmount)};};
  const summary=()=>{const t=totals();$('#order-summary').innerHTML=`<div class="summary-row"><span>Subtotal de lista</span><span>${money(t.subtotal)}</span></div><div class="summary-row"><span>Descuento del cliente (${t.discount}%)</span><span>− ${money(t.discountAmount)}</span></div><div class="summary-row total"><span>Total</span><span>${money(t.total)}</span></div><p class="help">Se registra en la cuenta corriente. Si ya cobraste, registrá el pago por separado.</p>`;};
  const draw=()=>{$('#order-lines').innerHTML=lines.map((l,i)=>`<div class="order-line"><span>${esc(l.name)}</span><input type="number" aria-label="Cantidad de ${esc(l.name)}" min="0.001" step="0.001" value="${l.qty}" data-qty="${i}" required><span class="line-price">${money(l.price)} c/u</span><button type="button" class="icon" data-remove="${i}" aria-label="Quitar ${esc(l.name)}">✕</button></div>`).join('');summary();};
  $('#product-search').oninput=options;options();summary();$('#order-client').onchange=summary;
  $('#add-product').onchange=e=>{const p=db.products.find(p=>p.id===e.target.value);if(!p)return;const existing=lines.find(l=>l.productId===p.id);if(existing)existing.qty++;else lines.push({productId:p.id,code:p.code,name:p.name,price:p.price,qty:1});e.target.value='';draw();};
  $('#order-lines').oninput=e=>{if(e.target.dataset.qty!==undefined){lines[Number(e.target.dataset.qty)].qty=Number(e.target.value);summary();}};
  $('#order-lines').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){lines.splice(Number(b.dataset.remove),1);draw();}};
  $('#order-form').onsubmit=e=>{e.preventDefault();if(!lines.length)return alert('Agregá al menos un producto.');if(lines.some(l=>!Number.isFinite(l.qty)||l.qty<=0))return alert('Revisá las cantidades.');const t=totals();if(!Number.isFinite(t.total))return alert('El importe es demasiado grande.');const record={id:uid(),number:Math.max(0,...db.orders.map(o=>o.number))+1,clientId:$('#order-client').value,date:$('#order-date').value,lines:structuredClone(lines),...t,status:'Pendiente',notes:$('#order-notes').value.trim()};if(commit(n=>n.orders.push(record))){close();view='pedidos';render();toast('Pedido guardado en la cuenta corriente');}};
}
function showOrder(id) {
  const o=db.orders.find(o=>o.id===id);if(!o)return;
  modal(`Pedido #${o.number}`,`<p><strong>${esc(client(o.clientId)?.name)}</strong> · ${prettyDate(o.date)}</p>${table(['Producto','Cantidad','Precio de lista','Importe'],o.lines.map(l=>`<tr><td>${esc(l.code)} · ${esc(l.name)}</td><td>${l.qty}</td><td>${money(l.price)}</td><td>${money(round(l.price*l.qty))}</td></tr>`).join(''))}<div class="order-summary"><div class="summary-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="summary-row"><span>Descuento (${o.discount}%)</span><span>− ${money(o.discountAmount)}</span></div><div class="summary-row total"><span>Total</span><span>${money(o.total)}</span></div></div><p>${esc(o.notes)}</p><div class="field"><label for="status">Estado de preparación (no indica si está pagado)</label><select id="status">${['Pendiente','Preparado','Entregado'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select></div><div class="actions"><button id="save-status" class="primary">Guardar estado</button><button id="print-order">Imprimir / PDF</button></div>`);
  $('#save-status').onclick=()=>{const status=$('#status').value;if(commit(n=>n.orders.find(x=>x.id===id).status=status)){close();render();toast('Estado actualizado');}};$('#print-order').onclick=()=>window.print();
}
function download(name,content,type) {const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=`empresa-${companyId}-${name}`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);}
function renderData(root) {
  root.innerHTML=`<div class="notice">Los datos se guardan solo en este navegador, no en la nube. Borrar sus datos elimina la información de la app. Descargá un respaldo seguido y guardalo en Archivos.</div><div class="grid"><section class="panel"><h2>Importar desde Excel</h2><p>Productos con código, descripción y precio. Clientes con teléfono, dirección, descuento y saldo inicial. Sin stock.</p><div class="field"><label for="import-type">¿Qué vas a importar?</label><select id="import-type"><option value="products">Productos</option><option value="clients">Clientes</option></select></div><label class="file-button">Elegir Excel o CSV<input id="import-file" type="file" accept=".xlsx,.xls,.csv"></label><p class="help">Elegí una hoja y asociá sus columnas antes de confirmar. Los productos se actualizan por código. Los clientes se actualizan por nombre exacto, sin distinguir mayúsculas; usá nombres únicos.</p><button id="template">Descargar plantilla CSV</button><p class="help">Excel (.xlsx/.xls) requiere conexión para cargar el lector. CSV funciona sin esa biblioteca.</p></section><section class="panel"><h2>Respaldo completo</h2><p>Incluye clientes, descuentos, productos, pedidos y pagos.</p><div class="stack"><button id="backup" class="primary">Descargar respaldo (.json)</button><label class="file-button">Restaurar respaldo<input id="restore" type="file" accept=".json"></label></div><p class="help">Restaurar reemplaza todos los datos actuales, con confirmación previa.</p></section></div>`;
  $('#backup').onclick=()=>download(`ferreteria-respaldo-${date()}.json`,JSON.stringify(db,null,2),'application/json');
  $('#template').onclick=()=>{const products=$('#import-type').value==='products';download(products?'plantilla-productos.csv':'plantilla-clientes.csv','\uFEFF'+(products?'codigo;descripcion;precio\r\nTOR001;Tornillo 6 mm;150,50\r\n':'nombre;telefono;direccion;descuento;saldo\r\nCliente ejemplo;1123456789;Calle 123;10;0\r\n'),'text/csv;charset=utf-8');};
  $('#import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;const type=$('#import-type').value;try{if(/\.csv$/i.test(file.name)){const text=await file.text();mapImport(type,parseCSV(text));}else{if(!globalThis.XLSX)throw Error('No se cargó el lector de Excel. Conectate a internet y recargá, o guardá tu archivo como CSV.');const book=XLSX.read(await file.arrayBuffer(),{type:'array'});chooseSheet(type,book);}}catch(err){alert(`No se pudo abrir el archivo: ${err.message}`);}finally{e.target.value='';}};
  $('#restore').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{const next=JSON.parse(await file.text());validateBackup(next);if(!confirm(`Se reemplazarán TODOS los datos por ${next.clients.length} clientes, ${next.products.length} productos, ${next.orders.length} pedidos y ${next.payments.length} pagos. ¿Continuar?`))return;const blocked=storageBlocked;storageBlocked=false;if(persist(next)){$('#storage-warning').hidden=true;render();toast('Respaldo restaurado');}else storageBlocked=blocked;}catch(err){alert(`Respaldo no válido: ${err.message}`);}finally{e.target.value='';}};
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
  const fields=type==='products'?[['code','Código *',['codigo','cod','sku']],['name','Descripción *',['descripcion','producto','nombre']],['price','Precio *',['precio','precio de lista','precio lista']]]:[['name','Nombre *',['nombre','cliente','razon social']],['phone','Teléfono',['telefono','celular']],['address','Dirección',['direccion','domicilio']],['discount','Descuento %',['descuento','descuento %','dto']],['opening','Saldo inicial',['saldo','saldo inicial','deuda']]];
  modal('Asociar columnas',`<p>Se detectaron <strong>${rows.length-1} filas</strong>. La primera fila se usa como encabezado.</p><div class="mapping">${fields.map(([key,label,aliases])=>{const found=headers.findIndex(h=>aliases.includes(normalize(h)));return `<div class="field"><label for="map-${key}">${label}</label><select id="map-${key}"><option value="">No importar</option>${headers.map((h,i)=>`<option value="${i}" ${i===found?'selected':''}>${esc(h||`Columna ${i+1}`)}</option>`).join('')}</select></div>`;}).join('')}</div><p class="help">Vista de las primeras filas:</p>${table(headers.map(esc),rows.slice(1,4).map(r=>`<tr>${headers.map((_,i)=>`<td>${esc(r[i])}</td>`).join('')}</tr>`).join(''))}<p class="notice">Los números con coma se interpretan con formato argentino: 1.250,50. Si no asociás una columna opcional, el valor existente se conserva. El descuento debe estar expresado entre 0 y 100 (10 significa 10%).</p><button id="check-import" class="primary">Revisar importación</button>`);
  $('#check-import').onclick=()=>{
    const mapping=Object.fromEntries(fields.map(([key])=>[key,$(`#map-${key}`).value]));
    const required=type==='products'?['code','name','price']:['name'];if(required.some(k=>mapping[k]===''))return alert('Asociá todas las columnas obligatorias (*).');
    const assigned=Object.values(mapping).filter(v=>v!=='');if(new Set(assigned).size!==assigned.length)return alert('Cada campo debe usar una columna diferente.');
    const next=structuredClone(db);let added=0,updated=0;const errors=[];const seen=new Set();const usedProducts=new Set();const skipped=[];
    rows.slice(1).forEach((r,i)=>{const get=k=>mapping[k]===''?'':r[Number(mapping[k])]??'';const name=String(get('name')).trim();const key=String(type==='products'?get('code'):name).trim();if(!name||!key){errors.push(`Fila ${i+2}: faltan nombre o código.`);return;}const matchKey=key.toLowerCase();if(type==='clients' && seen.has(matchKey)){errors.push(`Fila ${i+2}: ${key} está repetido en el archivo.`);return;}seen.add(matchKey);
      if(type==='products' && ['','-'].includes(String(get('price')).trim())){skipped.push(`${key} · ${name}`);return;}
      const list=next[type];const existing=type==='products'?list.find(x=>x.code.toLowerCase()===matchKey && !usedProducts.has(x.id)):list.find(x=>x.name.toLowerCase()===matchKey);
      const record=existing?{...existing}:type==='products'?{id:uid(),code:key,name,price:0}:{id:uid(),name,phone:'',address:'',discount:0,opening:0,notes:'',followup:''};record.name=name;
      if(type==='products'){record.code=key;record.price=round(parseNumber(get('price'),NaN));if(!Number.isFinite(record.price)||record.price<0){errors.push(`Fila ${i+2}: precio inválido.`);return;}}
      else{for(const k of ['phone','address'])if(mapping[k]!=='')record[k]=String(get(k)).trim();for(const k of ['discount','opening'])if(mapping[k]!=='')record[k]=round(parseNumber(get(k)));if(!Number.isFinite(record.discount)||record.discount<0||record.discount>100||!Number.isFinite(record.opening)){errors.push(`Fila ${i+2}: descuento o saldo inválido.`);return;}}
      if(type==='products')usedProducts.add(record.id);
      if(existing){list[list.indexOf(existing)]=record;updated++;}else{list.push(record);added++;}
    });
    if(errors.length)return alert(`No se importó nada. Corregí los siguientes errores:\n${errors.slice(0,15).join('\n')}${errors.length>15?'\nHay más errores…':''}`);
    modal('Confirmar importación',`<p><strong>${added}</strong> registros nuevos y <strong>${updated}</strong> actualizaciones.</p><p>Los pedidos anteriores conservarán sus precios y descuentos.</p>${type==='products'?'<p class="help">Los códigos repetidos se conservan como productos separados, en el orden del archivo. Al actualizar, mantené ese orden. Los precios se guardan en pesos, con dos decimales, sin conversión ni IVA adicional.</p>':''}${skipped.length?`<div class="notice"><strong>${skipped.length} fila(s) sin precio se omitirán; no se cargarán a $0.</strong><ul>${skipped.map(s=>`<li>${esc(s)}</li>`).join('')}</ul></div>`:''}${type==='clients'?'<p class="notice">Si asociás saldo inicial, se reemplaza ese saldo de los clientes existentes. No importes un saldo actual que ya incluya pedidos registrados en esta app.</p>':''}<div class="form-actions"><button id="confirm-import" class="primary">Confirmar importación</button></div>`);$('#confirm-import').onclick=()=>{if(persist(next)){close();view=type==='products'?'productos':'clientes';render();toast('Importación completada');}};
  };
}
function validateBackup(data) {
  const fail=()=>{throw Error('Estructura de datos incorrecta.');};const finite=n=>typeof n==='number'&&Number.isFinite(n);const text=v=>typeof v==='string';const validDate=d=>text(d)&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(new Date(d+'T12:00:00').getTime());
  if(!data||!['clients','products','orders','payments'].every(k=>Array.isArray(data[k])))fail();
  for(const key of ['clients','products','orders','payments']){const ids=new Set();for(const item of data[key]){if(!item||!text(item.id)||!item.id||ids.has(item.id))fail();ids.add(item.id);}}
  for(const c of data.clients)if(!text(c.name)||!c.name.trim()||!['phone','address','notes','followup'].every(k=>text(c[k]))||!finite(c.discount)||c.discount<0||c.discount>100||!finite(c.opening))fail();
  for(const p of data.products)if(!text(p.code)||!text(p.name)||!finite(p.price)||p.price<0)fail();
  const clients=new Set(data.clients.map(c=>c.id));const numbers=new Set();
  for(const o of data.orders){if(!clients.has(o.clientId)||!validDate(o.date)||!Number.isInteger(o.number)||o.number<1||numbers.has(o.number)||!['Pendiente','Preparado','Entregado'].includes(o.status)||!text(o.notes)||!Array.isArray(o.lines)||!o.lines.length||!['subtotal','discount','discountAmount','total'].every(k=>finite(o[k])&&o[k]>=0)||o.discount>100)fail();numbers.add(o.number);for(const l of o.lines)if(!text(l.name)||!text(l.code)||!text(l.productId)||!finite(l.qty)||l.qty<=0||!finite(l.price)||l.price<0)fail();const subtotal=round(o.lines.reduce((s,l)=>s+round(l.qty*l.price),0));if(Math.abs(subtotal-o.subtotal)>.001||Math.abs(round(subtotal*o.discount/100)-o.discountAmount)>.001||Math.abs(round(subtotal-o.discountAmount)-o.total)>.001)fail();}
  for(const p of data.payments)if(!clients.has(p.clientId)||!finite(p.amount)||p.amount<=0||!validDate(p.date)||!text(p.note))fail();
}
document.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.view){view=b.dataset.view;render();}
  if(b.dataset.client)showClient(b.dataset.client);
  if(b.dataset.editClient)editClient(b.dataset.editClient);
  if(b.dataset.product)editProduct(b.dataset.product);
  if(b.dataset.payment)payment(b.dataset.payment);
  if(b.dataset.order)showOrder(b.dataset.order);
  const action=b.dataset.action;if(action==='client')editClient();if(action==='product')editProduct();if(action==='import'){view='datos';render();}if(action==='orders'){view='pedidos';render();}
});
$('#company-select').onchange=e=>{close();companyId=e.target.value;KEY=companyId==='1'?'ferreteria-crm-v1':'ferreteria-crm-v1-company-2';savePreferences();loadCompany();render();toast(`Empresa activa: ${companyNames[companyId]}`);};
$('#rename-company').onclick=()=>{modal('Nombre de la empresa',`<form id="company-form">${field('Nombre','company-name',companyNames[companyId],'text','required maxlength="80"')}<div class="form-actions"><button class="primary">Guardar nombre</button></div></form>`);$('#company-form').onsubmit=e=>{e.preventDefault();const name=$('#company-name').value.trim();if(!name)return;companyNames[companyId]=name;savePreferences();close();for(const option of $('#company-select').options)option.textContent=companyNames[option.value];document.title=`${name} · CRM`;render();};};
$('#new-order').onclick=newOrder;$('#close-modal').onclick=close;
$('#today').textContent=new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
render();
