'use strict';
function commissionAmount(sale) {
  if (sale.kind === 'Porcentaje') return round(sale.amount * sale.rate / 100);
  return sale.kind === 'Monto fijo' ? sale.rate : 0;
}

function validSale(s) {
  return s && typeof s.id === 'string' && s.id && ['customer','description','date','beneficiary','notes','reference','bank','due'].every(k => typeof s[k] === 'string') &&
    s.customer.trim() && s.description.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.date) &&
    Number.isFinite(s.amount) && s.amount > 0 && Number.isFinite(s.rate) && s.rate >= 0 &&
    ['Sin comisión','Porcentaje','Monto fijo'].includes(s.kind) && (s.kind !== 'Porcentaje' || s.rate <= 100) &&
    commissionAmount(s) <= s.amount && ['Efectivo','Transferencia','Cheque'].includes(s.method) &&
    typeof s.collected === 'boolean' && (s.method !== 'Cheque' || (s.reference.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.due)));
}

function renderCommissions(root) {
  const sales = db.commissionSales || [];
  const total = sales.reduce((sum,s) => sum+s.amount,0);
  const fees = sales.reduce((sum,s) => sum+commissionAmount(s),0);
  const pending = sales.filter(s => s.method === 'Cheque' && !s.collected);
  const cards = [['Ventas',total],['Comisiones',fees],['Te queda',total-fees],['Cheques sin cobrar',pending.reduce((sum,s)=>sum+s.amount,0)]];
  const rows = sales.slice().reverse().map(s => `<tr><td>${prettyDate(s.date)}<br>${esc(s.customer)}</td><td>${esc(s.description)}<br>${esc(s.notes)}</td><td>${money(s.amount)}</td><td>${money(commissionAmount(s))}<br>${esc(s.beneficiary)}</td><td>${esc(s.method)} ${esc(s.reference)} ${esc(s.bank)} ${s.due ? prettyDate(s.due) : ''} ${s.method==='Cheque' ? (s.collected?'Cobrado':`<button data-settle="${esc(s.id)}">Marcar cobrado</button>`) : ''}</td></tr>`).join('');
  const receipts = db.payments.filter(p=>!p.voidedAt).flatMap(p=>(p.receipt?.tenders||[]).filter(t=>['Cheque','eCheq'].includes(t.method)).map(t=>`<tr><td>${esc(p.receipt.clientName)}</td><td>${esc(t.reference)} · ${esc(t.bank)}</td><td>${t.due?prettyDate(t.due):''}</td><td>${money(t.amount)}</td></tr>`)).join('');
  root.innerHTML = `<div class="cards">${cards.map(([label,n])=>`<div class="card"><small>${label}</small><div class="value">${money(n)}</div></div>`).join('')}</div><section class="panel"><div class="toolbar"><h2>Ventas y comisiones</h2><button class="primary" id="add-sale">Nueva venta</button></div>${table(['Fecha y cliente','Concepto','Venta','Comisión','Cobro'],rows)}</section><section class="panel"><h2>Cheques de recibos de cuenta corriente</h2>${table(['Cliente','Cheque y banco','Vencimiento','Importe'],receipts)}</section>`;
  $('#add-sale').onclick = newCommissionSale;
  root.querySelectorAll('[data-settle]').forEach(b=>b.onclick=()=>{
    if(commit(next=>{next.commissionSales.find(s=>s.id===b.dataset.settle).collected=true;})) render();
  });
}

function newCommissionSale() {
  const select = (id,label,choices) => `<label class="field">${label}<select id="${id}">${choices.map(v=>`<option>${v}</option>`).join('')}</select></label>`;
  modal('Nueva venta',`<form id="sale-form"><div class="form-grid">${field('A quién le vendiste','customer','','text','required')}${field('Qué vendiste','description','','text','required')}${field('Fecha','sale-date',date(),'date','required')}${field('Importe de la venta','amount','','number','min="0.01" step="0.01" required')}${select('kind','Comisión',['Sin comisión','Porcentaje','Monto fijo'])}${field('Porcentaje o monto','rate','','number','min="0" step="0.01"')}${field('Le queda a','beneficiary')}${select('method','Cómo lo cobraste',['Efectivo','Transferencia','Cheque'])}</div><div id="sale-cheque">${field('Número de cheque','reference')}${field('Banco','bank')}${field('Vencimiento','due','','date')}</div>${field('Notas','notes')}<p id="sale-preview" aria-live="polite"></p><button class="primary">Guardar venta</button></form>`);
  const val=id=>$('#'+id).value.trim();
  const read=()=>({customer:val('customer'),description:val('description'),date:val('sale-date'),amount:Number(val('amount')),kind:val('kind'),rate:val('kind')==='Sin comisión'?0:Number(val('rate')),beneficiary:val('beneficiary'),method:val('method'),reference:val('method')==='Cheque'?val('reference'):'',bank:val('method')==='Cheque'?val('bank'):'',due:val('method')==='Cheque'?val('due'):'',notes:val('notes'),collected:val('method')!=='Cheque'});
  const refresh=()=>{
    const s=read();
    $('#rate').disabled=s.kind==='Sin comisión';
    $('#rate').required=!$('#rate').disabled;
    $('#sale-cheque').hidden=s.method!=='Cheque';
    $('#reference').required=$('#due').required=s.method==='Cheque';
    $('#sale-preview').textContent='Comisión: '+money(commissionAmount(s))+' · Te queda: '+money(s.amount-commissionAmount(s));
  };
  refresh();
  $('#sale-form').oninput=refresh;
  $('#sale-form').onsubmit=e=>{
    e.preventDefault();
    const sale={id:uid(),...read()};
    if(!validSale(sale))return alert('Revisá el importe, la comisión y los datos del cheque.');
    if(commit(next=>(next.commissionSales??=[]).push(sale))){close();render();}
  };
}
