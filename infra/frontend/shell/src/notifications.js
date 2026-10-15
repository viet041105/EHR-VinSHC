import { esc } from '@vinshc/core';

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function notificationTarget(value, persona) {
  if (!value || typeof value !== 'object') return null;
  if (persona === 'admin' && value.kind === 'patient_access_request' && ID.test(value.requestUuid))
    return {kind: value.kind, requestUuid: value.requestUuid};
  if (persona === 'doctor' && value.kind === 'visit' && ID.test(value.visitUuid))
    return {kind: value.kind, visitUuid: value.visitUuid};
  if (persona === 'patient' && value.kind === 'portal_visit' && ID.test(value.visitUuid))
    return {kind: value.kind, visitUuid: value.visitUuid};
  return null;
}
const time = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('vi-VN') : '';
const bell = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"/><path d="M10 21h4"/></svg>';

// The server owns recipients, unread counts and read state. Nothing is persisted in the browser.
export class NotificationBell {
  constructor(client, onError, onOpen) {
    this.client=client; this.onError=onError; this.onOpen=onOpen;
    this.outside=e=>{if(this.open && !this.host?.contains(e.target))this.close();};
    this.escape=e=>{if(e.key==='Escape' && this.open){this.close();this.host?.querySelector('[data-bell-toggle]')?.focus();}};
    this.visibility=()=>{clearInterval(this.timer);if(!document.hidden && this.key){if(this.ready)this.load();this.startTimer();}};
  }
  mount(host, persona) {
    const key=JSON.stringify([this.client.generation,persona,this.client.workspace]);
    if(this.key!==key){this.clear();this.key=key;this.persona=persona;this.rows=[];this.count=0;this.open=false;this.ready=false;this.status='loading';this.offset=0;
      document.addEventListener('pointerdown',this.outside);document.addEventListener('keydown',this.escape);document.addEventListener('visibilitychange',this.visibility);
      this.host=host;this.load();this.startTimer();
    }
    this.host=host;this.paint();
  }
  startTimer(){if(!document.hidden)this.timer=setInterval(()=>{if(this.ready&&!this.loading)this.load();},60000);}
  clear(){clearInterval(this.timer);this.key=null;this.serial=(this.serial||0)+1;this.loading=false;this.rows=[];this.count=0;this.open=false;this.host?.replaceChildren();this.host=null;document.removeEventListener('pointerdown',this.outside);document.removeEventListener('keydown',this.escape);document.removeEventListener('visibilitychange',this.visibility);}
  close(){this.open=false;this.paint();}
  async load(more=false){
    if(this.loading||!this.key||!this.client.user)return;
    const key=this.key,serial=++this.serial,offset=more?this.rows.length:0;this.loading=true;this.error='';this.paint();
    try{
      const data=await this.client.request(`vinshc/notifications?limit=20&offset=${offset}`,{scoped:this.persona!=='patient'});
      if(key!==this.key||serial!==this.serial)return;
      if(!Array.isArray(data?.results)||!data.results.every(row=>row&&ID.test(row.uuid)&&typeof row.title==='string')||!Number.isInteger(data.unreadCount)||data.unreadCount<0)throw new Error('unsupported');
      this.rows=more?[...this.rows,...data.results]:data.results;this.count=data.unreadCount;this.more=!!data.hasMore;this.ready=true;this.status='ready';
    }catch(error){
      if(key!==this.key||serial!==this.serial)return;
      if(error.status===403&&this.persona==='patient'&&this.ready){this.clear();this.onError(error);return;}
      this.rows=[];this.count=0;this.more=false;this.ready=false;
      this.status=[404,405,501].includes(error.status)||error.message==='unsupported'?'waiting':error.status===403?'forbidden':'error';
      if(error.status===401){this.clear();this.onError(error);return;}
    }finally{if(key===this.key&&serial===this.serial){this.loading=false;this.paint();}}
  }
  async read(id){
    if(!this.ready||this.loading)return;
    const key=this.key;this.loading=true;this.error='';this.paint();
    try{await this.client.request('vinshc/notifications/'+(id==='all'?'read-all':encodeURIComponent(id)+'/read'),{method:'POST',scoped:this.persona!=='patient'});
      if(key!==this.key)return;this.loading=false;await this.load();
    }catch(error){if(key!==this.key)return;if(error.status===401||(error.status===403&&this.persona==='patient')){this.clear();this.onError(error);return;}this.error='Chưa đánh dấu được. Vui lòng thử lại.';}
    finally{if(key===this.key){this.loading=false;this.paint();}}
  }
  paint(){
    if(!this.host?.isConnected)return;
    const focused=this.host.querySelector(':focus')?.hasAttribute('data-bell-toggle');
    const status={loading:'Đang tải thông báo…',waiting:'Chờ kết nối máy chủ. Chức năng thông báo chưa được backend hỗ trợ.',forbidden:'Thông báo chưa khả dụng cho tài khoản này.',error:'Chưa tải được thông báo. Vui lòng thử lại.'};
    this.host.className='notification-bell';
    this.host.innerHTML=`<button type="button" class="bell-toggle" data-bell-toggle aria-label="Thông báo${this.count?', '+this.count+' chưa đọc':''}" aria-expanded="${!!this.open}" aria-controls="notification-list">${bell}${this.count?`<span class="bell-badge" aria-hidden="true">${this.count>99?'99+':this.count}</span>`:''}</button>${this.open?`<section id="notification-list" class="notification-popover" aria-label="Thông báo"><div class="notification-heading"><h2>Thông báo</h2><button type="button" data-bell-close aria-label="Đóng thông báo">×</button></div><div class="notification-tools"><button type="button" data-bell-refresh ${this.loading?'disabled':''}>Làm mới</button>${this.ready&&this.count?`<button type="button" data-bell-all ${this.loading?'disabled':''}>Đọc tất cả</button>`:''}</div>${this.error?`<p class="error" role="alert">${esc(this.error)}</p>`:''}${this.ready?`${this.rows.length?`<ul>${this.rows.map((row,i)=>`<li class="${row.readAt?'':'unread'}"><strong>${esc(row.title||'Thông báo')}</strong><p>${esc(row.message||'')}</p><time>${esc(time(row.createdAt))}</time><div>${notificationTarget(row.target,this.persona)?`<button type="button" data-bell-open="${i}">Mở công việc</button>`:''}${!row.readAt&&ID.test(row.uuid)?`<button type="button" data-bell-read="${esc(row.uuid)}" ${this.loading?'disabled':''}>Đã đọc</button>`:''}</div></li>`).join('')}</ul>`:'<p class="notification-empty">Bạn chưa có thông báo.</p>'}${this.more?`<button type="button" data-bell-more ${this.loading?'disabled':''}>Tải thêm</button>`:''}`:`<p class="notification-empty" role="status">${status[this.status]}</p>`}</section>`:''}`;
    this.host.querySelector('[data-bell-toggle]').onclick=()=>{this.open=!this.open;this.paint();if(this.open)this.load();};
    this.host.querySelector('[data-bell-close]')?.addEventListener('click',()=>{this.close();this.host.querySelector('[data-bell-toggle]').focus();});
    this.host.querySelector('[data-bell-refresh]')?.addEventListener('click',()=>this.load());
    this.host.querySelector('[data-bell-more]')?.addEventListener('click',()=>this.load(true));
    this.host.querySelector('[data-bell-all]')?.addEventListener('click',()=>this.read('all'));
    this.host.querySelectorAll('[data-bell-read]').forEach(b=>b.onclick=()=>this.read(b.dataset.bellRead));
    this.host.querySelectorAll('[data-bell-open]').forEach(b=>b.onclick=()=>{const target=notificationTarget(this.rows[Number(b.dataset.bellOpen)]?.target,this.persona);if(target){this.close();this.onOpen(target);}});
    if(focused)this.host.querySelector('[data-bell-toggle]').focus();
  }
}
