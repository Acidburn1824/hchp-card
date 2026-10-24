/**
 * HC/HP Card — Carte Lovelace Home Assistant
 * Contrat EDF Heures Creuses / Heures Pleines
 *
 * Configuration 100 % visuelle via l'éditeur de carte HA (aucun YAML requis).
 *
 * Fonctionnalités :
 *  - Détection HC/HP selon l'heure et le type de jour
 *  - Jours fériés français calculés automatiquement
 *  - Plages différentes : semaine, mercredi, week-end, jours fériés
 *  - Prix HC/HP configurables via l'UI
 *  - Puissance instantanée colorée (vert/orange/rouge)
 *  - Stats conso jour / semaine / mois / an
 *
 * Version : 1.0.0 · Licence MIT
 */

// ─── Jours fériés français ────────────────────────────────────────────────────

function _easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const dy = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, mo, dy);
}

function isFrenchHoliday(date) {
  const y = date.getFullYear(), mo = date.getMonth() + 1, dy = date.getDate();
  if ([[1,1],[5,1],[5,8],[7,14],[8,15],[11,1],[11,11],[12,25]].some(([m,d]) => mo===m && dy===d)) return true;
  const e = _easter(y);
  return [1, 39, 50].some(off => {
    const h = new Date(e); h.setDate(h.getDate() + off);
    return h.getMonth()+1 === mo && h.getDate() === dy;
  });
}

function getDayType(date) {
  if (isFrenchHoliday(date)) return 'holiday';
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return 'weekend';
  if (dow === 3) return 'wednesday';
  return 'weekday';
}

const DAY_LABELS = { weekday: 'Semaine', wednesday: 'Mercredi', weekend: 'Week-end', holiday: 'Jour férié' };

// ─── Logique HC/HP ───────────────────────────────────────────────────────────

function toMin(t) { const [h,m]=(t||'00:00').split(':').map(Number); return h*60+(m||0); }

function currentlyHC(date, schedules) {
  const type = getDayType(date);
  const sched = schedules[type] || schedules['weekday'] || {};
  if (!sched.hc?.length) return false;
  const now = date.getHours()*60 + date.getMinutes();
  return sched.hc.some(({start,end}) => {
    const s = toMin(start), e = toMin(end);
    if (e >= 1439) return now >= s; // 23:59 ou 24:00 = jusqu'à minuit inclus
    return s < e ? (now >= s && now < e) : (now >= s || now < e);
  });
}

function isAllDayHC(schedules, dayType) {
  const sched = schedules[dayType] || schedules['weekday'] || {};
  const slots = sched.hc || [];
  // 24:00 (1440) ou 23:59 (1439) = toute la journée
  return slots.some(({start, end}) => toMin(start) === 0 && (toMin(end) >= 1439));
}

function nextSwitch(date, schedules) {
  const type = getDayType(date);
  if (isAllDayHC(schedules, type)) return null;
  const sched = schedules[type] || schedules['weekday'] || {};
  if (!sched.hc?.length) return null;
  const now = date.getHours()*60 + date.getMinutes();
  const pts = sched.hc.flatMap(({start,end}) => [toMin(start), toMin(end)]).sort((a,b)=>a-b);
  const nxt = pts.find(t => t > now) ?? (pts[0] + 1440);
  const diff = nxt > now ? nxt - now : nxt + 1440 - now;
  const h = Math.floor(diff/60), m = diff%60;
  return h > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${m} min`;
}

// ─── Helpers affichage ────────────────────────────────────────────────────────

const fmtW   = w => isNaN(w)||w==null ? '--' : w>=1000 ? `${(w/1000).toFixed(2)} kW` : `${Math.round(w)} W`;
const fmtKwh = v => v==null||isNaN(v) ? '--' : `${v.toFixed(2)} kWh`;
const fmtEur = (v,p) => v==null||isNaN(v) ? '' : `≈ ${(v*p).toFixed(2)} €`;
const pColor  = (w,t) => isNaN(w)||w==null ? '#888' : w<=t.low ? '#00cc66' : w<=t.medium ? '#ff9900' : '#ff4444';

// ─── Config par défaut ────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  name: 'Tarif HC/HP',
  power_entity: '',
  energy_entity: '',
  prices: { hc: 0.1792, hp: 0.2403 },
  schedules: {
    weekday:   { hc: [{ start: '22:30', end: '06:30' }] },
    wednesday: { hc: [{ start: '00:00', end: '24:00' }] },
    weekend:   { hc: [{ start: '00:00', end: '24:00' }] },
    holiday:   { hc: [{ start: '00:00', end: '24:00' }] },
  },
  thresholds: { low: 1000, medium: 3000, high: 6000 },
};

function mergeConfig(cfg) {
  return {
    ...DEFAULT_CONFIG,
    ...cfg,
    prices:     { ...DEFAULT_CONFIG.prices,     ...(cfg.prices     || {}) },
    thresholds: { ...DEFAULT_CONFIG.thresholds, ...(cfg.thresholds || {}) },
    schedules:  {
      ...DEFAULT_CONFIG.schedules,
      ...(cfg.schedules || {}),
      weekday:   { hc: cfg.schedules?.weekday?.hc   ?? DEFAULT_CONFIG.schedules.weekday.hc   },
      wednesday: { hc: cfg.schedules?.wednesday?.hc ?? DEFAULT_CONFIG.schedules.wednesday.hc },
      weekend:   { hc: cfg.schedules?.weekend?.hc   ?? DEFAULT_CONFIG.schedules.weekend.hc   },
      holiday:   { hc: cfg.schedules?.holiday?.hc   ?? DEFAULT_CONFIG.schedules.holiday.hc   },
    },
  };
}

// ─── Styles carte ─────────────────────────────────────────────────────────────

const CARD_CSS = `
  :host { display: block; }
  * { box-sizing: border-box; }

  .card {
    background: linear-gradient(135deg, #0f2027, #203a43, #2c5364);
    border-radius: 24px;
    padding: 20px;
    color: #fff;
    font-family: var(--primary-font-family, system-ui, sans-serif);
  }

  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .title  { font-size: 1rem; font-weight: 600; margin-bottom: 2px; }
  .sub    { font-size: .7rem; opacity: .45; }

  .badge { padding: 5px 13px; border-radius: 20px; font-size: .82rem; font-weight: 700; }
  .hc    { background: rgba(0,120,255,.25); color: #7ab8ff; border: 1px solid rgba(0,120,255,.4); }
  .hp    { background: rgba(255,80,0,.25);  color: #ffaa77; border: 1px solid rgba(255,80,0,.4); }

  .section       { background: rgba(255,255,255,.08); border-radius: 16px; padding: 12px 14px; margin-bottom: 9px; }
  .section-title { font-size: .67rem; opacity: .45; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }

  .price-row  { display: flex; justify-content: space-between; align-items: center; }
  .price-big  { font-size: 1.85rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .price-unit { font-size: .78rem; opacity: .5; margin-left: 2px; }
  .price-side { font-size: .72rem; opacity: .5; text-align: right; line-height: 1.7; }

  .pw-val  { font-size: 1.55rem; font-weight: 700; font-variant-numeric: tabular-nums; transition: color .4s; }
  .pw-meta { font-size: .72rem; opacity: .45; margin-top: 2px; }

  .bar       { height: 8px; background: rgba(255,255,255,.1); border-radius: 4px; overflow: hidden; margin: 10px 0 5px; }
  .bar-fill  { height: 100%; border-radius: 4px; transition: width .6s ease, background .4s; }
  .bar-ticks { display: flex; justify-content: space-between; font-size: .63rem; opacity: .38; }

  .grid     { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .stat     { background: rgba(255,255,255,.06); border-radius: 12px; padding: 9px 11px; }
  .st-lbl   { font-size: .63rem; opacity: .4; margin-bottom: 3px; }
  .st-val   { font-size: .98rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .st-cost  { font-size: .68rem; opacity: .5; margin-top: 1px; }

  .sched-list { list-style: none; padding: 0; margin: 0; }
  .sched-item { display: flex; align-items: center; gap: 8px; font-size: .8rem; padding: 3px 0; }
  .dot        { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .dot-hc     { background: #7ab8ff; }
  .dot-hp     { background: #ffaa77; }
  .sched-side { margin-left: auto; font-size: .65rem; opacity: .4; }
  .no-data    { opacity: .3; text-align: center; font-size: .73rem; padding: 4px 0; }
`;

// ─── Carte ────────────────────────────────────────────────────────────────────

class HCHPCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._hass = null;
    this._config = null;
    this._stats = {};
    this._statsTs = 0;
    this._tick = null;
  }

  connectedCallback()    { this._tick = setInterval(() => this._render(), 30_000); }
  disconnectedCallback() { clearInterval(this._tick); }

  static getConfigElement() { return document.createElement('hchp-card-editor'); }
  static getStubConfig()    { return { ...DEFAULT_CONFIG }; }

  set hass(hass) {
    this._hass = hass;
    if (this._config?.energy_entity && Date.now() - this._statsTs > 300_000) this._loadStats();
    this._render();
  }

  setConfig(cfg) {
    if (!cfg) throw new Error('[HC/HP Card] config vide');
    this._config = mergeConfig(cfg);
  }

  getCardSize() { return 6; }

  async _loadStats() {
    if (!this._hass || !this._config?.energy_entity) return;
    const eid = this._config.energy_entity;
    try {
      const now = new Date();
      const sod = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const som = new Date(now.getFullYear(), now.getMonth(), 1);
      const soy = new Date(now.getFullYear(), 0, 1);
      const dow = now.getDay() || 7;
      const sow = new Date(now); sow.setDate(now.getDate() - dow + 1); sow.setHours(0,0,0,0);

      const [dR, mR, yR] = await Promise.all([
        this._hass.callWS({ type:'recorder/statistics_during_period', start_time:sod.toISOString(), end_time:now.toISOString(), statistic_ids:[eid], period:'hour',  units:{energy:'kWh'} }),
        this._hass.callWS({ type:'recorder/statistics_during_period', start_time:som.toISOString(), end_time:now.toISOString(), statistic_ids:[eid], period:'day',   units:{energy:'kWh'} }),
        this._hass.callWS({ type:'recorder/statistics_during_period', start_time:soy.toISOString(), end_time:now.toISOString(), statistic_ids:[eid], period:'month', units:{energy:'kWh'} }),
      ]);
      const sum = r => (r[eid]||[]).reduce((a,s)=>a+(s.change??0),0);
      const week = (mR[eid]||[]).filter(s=>new Date(s.start)>=sow).reduce((a,s)=>a+(s.change??0),0);
      this._stats = { today:sum(dR), week, month:sum(mR), year:sum(yR) };
      this._statsTs = Date.now();
      this._render();
    } catch(e) { console.error('[HC/HP Card] stats :', e); }
  }

  _render() {
    if (!this._config) return;

    const now   = new Date();
    const hc    = currentlyHC(now, this._config.schedules);
    const dt    = getDayType(now);
    const price = hc ? this._config.prices.hc : this._config.prices.hp;
    const avg   = (this._config.prices.hc + this._config.prices.hp) / 2;
    const sched = this._config.schedules[dt] || {};
    const slots = sched.hc || [];

    const ps   = this._hass?.states[this._config.power_entity];
    const pw   = ps ? parseFloat(ps.state) : NaN;
    const col  = pColor(pw, this._config.thresholds);
    // Échelle racine carrée : visuellement plus lisible sur faibles conso, 100% = seuil haut
    const pPct = isNaN(pw) ? 0 : Math.min(100, Math.sqrt(Math.max(0, pw) / this._config.thresholds.high) * 100);
    const cph  = isNaN(pw) ? '--' : `${(pw/1000*price).toFixed(4)} €/h`;

    const time = now.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
    const nxt  = nextSwitch(now, this._config.schedules);

    const t = this._config.thresholds;

    this.shadowRoot.innerHTML = `
      <style>${CARD_CSS}</style>
      <div class="card">

        <div class="header">
          <div>
            <div class="title">⚡ ${this._config.name}</div>
            <div class="sub">${DAY_LABELS[dt]} · ${time}${nxt ? ` · bascule dans ${nxt}` : ''}</div>
          </div>
          <span class="badge ${hc?'hc':'hp'}">${hc?'🌙 HC':'☀️ HP'}</span>
        </div>

        <div class="section">
          <div class="section-title">Prix actuel</div>
          <div class="price-row">
            <div>
              <span class="price-big">${price.toFixed(4)}</span>
              <span class="price-unit">€/kWh</span>
            </div>
            <div class="price-side">
              🌙 HC : ${this._config.prices.hc.toFixed(4)} €<br>
              ☀️ HP : ${this._config.prices.hp.toFixed(4)} €
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Puissance instantanée</div>
          <div style="display:flex;justify-content:space-between;align-items:flex-end">
            <div>
              <div class="pw-val" style="color:${col}">${fmtW(pw)}</div>
              <div class="pw-meta">${cph}${ps?'':' · capteur introuvable'}</div>
            </div>
            <div style="font-size:.65rem;opacity:.35;text-align:right">${this._config.power_entity}</div>
          </div>
          <div class="bar"><div class="bar-fill" style="width:${pPct}%;background:${col}"></div></div>
          <div class="bar-ticks">
            <span>0</span>
            <span>${t.low/1000} kW</span>
            <span>${t.medium/1000} kW</span>
            <span>${t.high/1000} kW</span>
          </div>
        </div>

        ${this._config.energy_entity ? `
        <div class="section">
          <div class="section-title">Consommation &amp; coût estimé</div>
          <div class="grid">
            ${[["Aujourd'hui",this._stats.today],["Cette semaine",this._stats.week],
               ["Ce mois",this._stats.month],["Cette année",this._stats.year]].map(([l,v])=>`
              <div class="stat">
                <div class="st-lbl">${l}</div>
                <div class="st-val">${fmtKwh(v)}</div>
                <div class="st-cost">${fmtEur(v,avg)}</div>
              </div>`).join('')}
          </div>
        </div>` : `
        <div class="section">
          <div class="no-data">Renseignez un capteur d'énergie (kWh) pour afficher la conso</div>
        </div>`}

        <div class="section">
          <div class="section-title">Plages HC · ${DAY_LABELS[dt]}</div>
          <ul class="sched-list">
            ${isAllDayHC(this._config.schedules, dt) ? `
              <li class="sched-item">
                <div class="dot dot-hc"></div>
                <span>Toute la journée</span>
                <span class="sched-side">HC · ${this._config.prices.hc.toFixed(4)} €</span>
              </li>` : `
              ${slots.map(({start,end})=>`
              <li class="sched-item">
                <div class="dot dot-hc"></div>
                <span>${start} → ${end}</span>
                <span class="sched-side">HC · ${this._config.prices.hc.toFixed(4)} €</span>
              </li>`).join('')}
              <li class="sched-item">
                <div class="dot dot-hp"></div>
                <span>Reste de la journée</span>
                <span class="sched-side">HP · ${this._config.prices.hp.toFixed(4)} €</span>
              </li>`}
          </ul>
        </div>

      </div>`;
  }
}

// ─── Éditeur visuel ───────────────────────────────────────────────────────────

const EDITOR_CSS = `
  * { box-sizing: border-box; }
  .editor { padding: 4px 0; font-family: var(--primary-font-family, system-ui); }
  h3 { font-size: .78rem; text-transform: uppercase; letter-spacing: .07em;
       opacity: .55; margin: 16px 0 8px; padding-bottom: 4px;
       border-bottom: 1px solid var(--divider-color, rgba(0,0,0,.12)); }
  .row   { margin-bottom: 10px; }
  label  { display: block; font-size: .8rem; margin-bottom: 4px; opacity: .75; }
  input, select {
    width: 100%; padding: 8px 10px; border-radius: 8px; font-size: .88rem;
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color, #333);
    border: 1px solid var(--divider-color, #ccc);
  }
  .two   { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .slot  { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
  .slot input { flex: 1; }
  .rm    { background: none; border: none; cursor: pointer; color: var(--error-color, #c00);
           font-size: 1.1rem; padding: 0 4px; }
  .add   { font-size: .78rem; cursor: pointer; color: var(--primary-color, #007bff);
           background: none; border: none; padding: 0; margin-top: 2px; }
  .day-block { margin-bottom: 12px; }
  .day-label { font-size: .8rem; font-weight: 600; margin-bottom: 6px; }
  .allday-row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: .8rem; cursor: pointer; }
  .allday-row input[type=checkbox] { width: auto; margin: 0; cursor: pointer; accent-color: var(--primary-color, #007bff); }
  .note  { font-size: .72rem; opacity: .5; margin-top: 4px; }
`;

class HCHPCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = mergeConfig({});
  }

  setConfig(cfg) {
    this._config = mergeConfig(cfg || {});
    this._render();
  }

  _fire() {
    this.dispatchEvent(new CustomEvent('config-changed', {
      detail: { config: { ...this._config } },
      bubbles: true, composed: true,
    }));
  }

  _set(path, value) {
    const keys = path.split('.');
    let obj = this._config;
    keys.slice(0, -1).forEach(k => { obj = obj[k]; });
    obj[keys[keys.length - 1]] = value;
    this._fire();
    this._render();
  }

  _setAllDay(dayType, checked) {
    if (checked) {
      this._config.schedules[dayType].hc = [{ start: '00:00', end: '23:59' }];
    } else {
      this._config.schedules[dayType].hc = [{ start: '22:30', end: '06:30' }];
    }
    this._fire(); this._render();
  }

  _addSlot(dayType) {
    this._config.schedules[dayType].hc.push({ start: '00:00', end: '06:00' });
    this._fire(); this._render();
  }

  _removeSlot(dayType, idx) {
    this._config.schedules[dayType].hc.splice(idx, 1);
    this._fire(); this._render();
  }

  _updateSlot(dayType, idx, field, value) {
    this._config.schedules[dayType].hc[idx][field] = value;
    this._fire();
  }

  _render() {
    const c  = this._config;
    const sched = c.schedules;

    this.shadowRoot.innerHTML = `<style>${EDITOR_CSS}</style>
    <div class="editor">

      <h3>Général</h3>
      <div class="row">
        <label>Nom de la carte</label>
        <input id="name" type="text" value="${c.name}" placeholder="Tarif HC/HP">
      </div>

      <h3>Entités Home Assistant</h3>
      <div class="row">
        <label>Capteur de puissance (W) *</label>
        <input id="power_entity" type="text" value="${c.power_entity}" placeholder="sensor.linky_puissance_instant">
      </div>
      <div class="row">
        <label>Capteur d'énergie (kWh) — optionnel, pour les stats de conso</label>
        <input id="energy_entity" type="text" value="${c.energy_entity || ''}" placeholder="sensor.linky_index_total">
      </div>

      <h3>Prix (€/kWh TTC)</h3>
      <div class="two">
        <div class="row">
          <label>🌙 Heures Creuses</label>
          <input id="price_hc" type="number" step="0.0001" value="${c.prices.hc}">
        </div>
        <div class="row">
          <label>☀️ Heures Pleines</label>
          <input id="price_hp" type="number" step="0.0001" value="${c.prices.hp}">
        </div>
      </div>

      <h3>Plages Heures Creuses par type de jour</h3>

      ${['weekday','wednesday','weekend','holiday'].map(dt => {
        const slots = sched[dt]?.hc || [];
        const allDay = slots.length === 1 && slots[0].start === '00:00' && (slots[0].end === '23:59' || slots[0].end === '24:00');
        return `
        <div class="day-block">
          <div class="day-label">${DAY_LABELS[dt]}</div>
          <label class="allday-row">
            <input type="checkbox" class="allday-cb" data-type="${dt}" ${allDay ? 'checked' : ''}>
            Toute la journée (HC flat rate)
          </label>
          ${!allDay ? `
            ${slots.map((slot, i) => `
              <div class="slot">
                <input class="slot-start" data-type="${dt}" data-idx="${i}" type="time" value="${slot.start}">
                <span style="opacity:.4">→</span>
                <input class="slot-end" data-type="${dt}" data-idx="${i}" type="time" value="${slot.end}">
                <button class="rm" data-rm="${dt}" data-idx="${i}" title="Supprimer">✕</button>
              </div>
            `).join('')}
            <button class="add" data-add="${dt}">+ Ajouter une plage HC</button>
          ` : ''}
        </div>`;
      }).join('')}

      <h3>Seuils puissance (couleur de la barre)</h3>
      <div class="two">
        <div class="row">
          <label>🟢 Bas (W)</label>
          <input id="thr_low" type="number" step="100" value="${c.thresholds.low}">
        </div>
        <div class="row">
          <label>🟠 Moyen (W)</label>
          <input id="thr_medium" type="number" step="100" value="${c.thresholds.medium}">
        </div>
      </div>
      <div class="row">
        <label>🔴 Élevé (W)</label>
        <input id="thr_high" type="number" step="100" value="${c.thresholds.high}" style="max-width:50%">
      </div>

      <div class="note">* Capteur requis. Retrouvez le nom dans HA → Outils de développement → États.</div>
    </div>`;

    // Listeners simples
    const el = id => this.shadowRoot.getElementById(id);
    el('name')      .addEventListener('change', e => this._set('name', e.target.value));
    el('power_entity') .addEventListener('change', e => this._set('power_entity', e.target.value.trim()));
    el('energy_entity').addEventListener('change', e => this._set('energy_entity', e.target.value.trim()));
    el('price_hc')  .addEventListener('change', e => this._set('prices.hc', parseFloat(e.target.value)));
    el('price_hp')  .addEventListener('change', e => this._set('prices.hp', parseFloat(e.target.value)));
    el('thr_low')   .addEventListener('change', e => this._set('thresholds.low',    parseInt(e.target.value)));
    el('thr_medium').addEventListener('change', e => this._set('thresholds.medium', parseInt(e.target.value)));
    el('thr_high')  .addEventListener('change', e => this._set('thresholds.high',   parseInt(e.target.value)));

    this.shadowRoot.querySelectorAll('.slot-start').forEach(inp => {
      inp.addEventListener('change', e => {
        this._updateSlot(e.target.dataset.type, +e.target.dataset.idx, 'start', e.target.value);
      });
    });
    this.shadowRoot.querySelectorAll('.slot-end').forEach(inp => {
      inp.addEventListener('change', e => {
        this._updateSlot(e.target.dataset.type, +e.target.dataset.idx, 'end', e.target.value);
      });
    });
    this.shadowRoot.querySelectorAll('[data-rm]').forEach(btn => {
      btn.addEventListener('click', e => this._removeSlot(e.target.dataset.rm, +e.target.dataset.idx));
    });
    this.shadowRoot.querySelectorAll('[data-add]').forEach(btn => {
      btn.addEventListener('click', e => this._addSlot(e.target.dataset.add));
    });
    this.shadowRoot.querySelectorAll('.allday-cb').forEach(cb => {
      cb.addEventListener('change', e => this._setAllDay(e.target.dataset.type, e.target.checked));
    });
  }
}

// ─── Enregistrement ───────────────────────────────────────────────────────────

customElements.define('hchp-card',        HCHPCard);
customElements.define('hchp-card-editor', HCHPCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: 'hchp-card',
  name: 'HC/HP Card',
  description: 'Carte HC/HP configurable via UI : plages par jour, prix, puissance live et stats de conso.',
  preview: true,
  documentationURL: 'https://github.com/VOTRE_PSEUDO/hchp-card',
});
