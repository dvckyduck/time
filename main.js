/* ...existing code... */
const timeEl = document.getElementById('time');
const ampmEl = document.getElementById('ampm');
const tzEl = document.getElementById('tz');
const toggle = document.getElementById('toggle');
const offsetEl = document.getElementById('offset');
const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

let dark = true; // default dark
if (!prefersDark) {
  // still keep dark default per request; user can toggle manually
}

/* ...existing code... */
function pad(n){ return n.toString().padStart(2,'0'); }

function updateTime(){
  const now = new Date();
  // show user's locale time with seconds
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const seconds = now.getSeconds();

  // show 24h like "14:05:09" and also show short timezone label
  timeEl.textContent = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;

  // Get timezone short name and offset
  try{
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const tzName = tz.replace('_',' ');
    tzEl.textContent = `Timezone: ${tzName}`;
    ampmEl.textContent = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(now).find(p=>p.type==='timeZoneName')?.value || '';
  }catch(e){
    tzEl.textContent = 'Timezone: UTC';
    ampmEl.textContent = '';
  }
}

/* animate subtle zoom on new minute */
let lastMinute = null;
function tick(){
  updateTime();
  const now = new Date();
  const m = now.getMinutes();
  if (m !== lastMinute){
    lastMinute = m;
    timeEl.animate([{ transform:'scale(1)' }, { transform:'scale(1.02)' }, { transform:'scale(1)' }], { duration:600, easing:'ease-out' });
  }
}

/* start */
tick();
setInterval(tick, 1000);

/* theme toggle */
function applyTheme(){
  document.body.classList.toggle('theme-dark', dark);
  document.body.classList.toggle('theme-light', !dark);
  toggle.textContent = dark ? 'Light' : 'Dark';
  toggle.setAttribute('aria-pressed', (!dark).toString());
}
toggle.addEventListener('click', ()=>{
  dark = !dark;
  applyTheme();
});
applyTheme();

/* Accessibility: keyboard toggle */
toggle.addEventListener('keydown', (e)=>{
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggle.click();
  }
});

async function fetchAuthorityTime(){
  // try multiple public time APIs in sequence for better availability
  const endpoints = [
    async () => { // worldtimeapi
      const res = await fetch('https://worldtimeapi.org/api/ip');
      if (!res.ok) throw new Error('worldtimeapi failed');
      const data = await res.json();
      return new Date(data.utc_datetime);
    },
    async () => { // timeapi.io - returns local UTC datetime field
      const res = await fetch('https://timeapi.io/api/Time/current/zone?timeZone=UTC');
      if (!res.ok) throw new Error('timeapi failed');
      const data = await res.json(); // { dateTime: "2025-09-13T12:34:56" ... }
      if (data && data.dateTime) return new Date(data.dateTime + 'Z');
      throw new Error('timeapi bad payload');
    },
    async () => { // worldclockapi fallback
      const res = await fetch('http://worldclockapi.com/api/json/utc/now');
      if (!res.ok) throw new Error('worldclockapi failed');
      const data = await res.json(); // { currentDateTime: "2025-09-13T12:34Z" }
      if (data && data.currentDateTime) return new Date(data.currentDateTime);
      throw new Error('worldclockapi bad payload');
    }
  ];

  for (const fn of endpoints){
    try{
      const dt = await fn();
      if (dt instanceof Date && !isNaN(dt)) return dt;
    }catch(e){
      // try next
    }
  }
  return null;
}

function formatOffset(deltaMs){
  // produce compact signed string, omitting leading zero segments
  const sign = deltaMs >= 0 ? '+' : '-';
  const abs = Math.abs(deltaMs);
  const ms = abs % 1000;
  const totalSec = Math.floor(abs / 1000);
  const secs = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mins = totalMin % 60;
  const hrs = Math.floor(totalMin / 60);

  // build parts, omit leading zero groups unless a lower unit exists
  const parts = [];
  if (hrs > 0) parts.push(String(hrs));            // hours always shown if >0
  if (mins > 0 || hrs > 0) parts.push(String(mins).padStart(2,'0')); // show minutes if hrs present or mins >0
  // seconds: show if any higher shown or secs>0 or ms>0
  const showSeconds = hrs>0 || mins>0 || secs>0 || ms>0;
  if (showSeconds) {
    const secStr = (hrs>0 || mins>0) ? String(secs).padStart(2,'0') : String(secs);
    // append milliseconds if present
    const msStr = ms > 0 ? `.${String(ms).padStart(3,'0')}` : '';
    parts.push(secStr + msStr);
  }

  // if all zero, show "0s"
  const body = parts.length ? parts.join(':') : '0s';
  // append unit for pure seconds/milliseconds when no ":" present
  const final = body.includes(':') ? body : `${body}${body.endsWith('s') ? '' : 's'}`;
  return `${sign}${final}`;
}

async function updateOffsetStatus(){
  offsetEl.textContent = 'Sync: checking…';
  offsetEl.className = 'offset';
  const serverTime = await fetchAuthorityTime();
  if (!serverTime){
    offsetEl.textContent = 'Sync: unavailable';
    offsetEl.classList.add('warn');
    return;
  }
  const localNow = new Date();
  const delta = localNow - serverTime; // positive => local ahead
  const exact = formatOffset(delta);
  let label = '';
  if (Math.abs(delta) < 2000) { // <2s
    label = `In sync (${exact})`;
    offsetEl.classList.add('ok');
  } else if (Math.abs(delta) < 60000) { // <1min
    label = `Slightly ${delta>0? 'ahead':'behind'} (${exact})`;
    offsetEl.classList.add('warn');
  } else {
    label = `${delta>0? 'Your clock is ahead':'Your clock is behind'} (${exact})`;
    offsetEl.classList.add('bad');
  }
  offsetEl.textContent = label;
}

/* Kick off offset checks periodically */
updateOffsetStatus();
setInterval(updateOffsetStatus, 1000 * 60 * 5); // refresh every 5 minutes
