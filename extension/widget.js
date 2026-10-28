(() => {
  if (document.getElementById('posture-guardian-widget')) return;
  const host = document.createElement('div');
  host.id = 'posture-guardian-widget';
  host.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;display:block!important;';
  const shadow = host.attachShadow({mode: 'closed'});
  shadow.innerHTML = `<style>
    :host{color-scheme:dark}button{font-family:system-ui,sans-serif;cursor:pointer}
    .card{--tone:#94a3b8;display:flex;align-items:center;gap:12px;background:#111827;color:#f8fafc;border:2px solid var(--tone);border-radius:16px;padding:12px 16px;box-shadow:0 6px 24px #0005;min-width:150px;text-align:left;transition:border-color .3s}
    .dot{width:10px;height:10px;border-radius:50%;background:var(--tone)}
    .score{font-size:28px;font-weight:750;color:var(--tone);line-height:1.1}
    .label{font-size:11px;color:#cbd5e1;margin-bottom:3px}.state{font-size:12px;margin-top:3px}
    .close{position:absolute;right:-7px;top:-8px;border:1px solid #64748b;border-radius:50%;width:22px;height:22px;background:#1e293b;color:white;font-size:14px}
    button:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}
    @media(max-width:480px){.card{padding:8px 12px;min-width:120px}.score{font-size:24px}}
  </style><button class="card" title="자세 분석 열기"><span class="dot"></span><span><div class="label">PostureGuardian</div><div class="score">—</div><div class="state">분석 대기</div></span></button><button class="close" aria-label="이 페이지에서 위젯 숨기기" title="이 페이지에서 숨기기">×</button>`;
  // Reattach if a site replaces its document root; full navigation restores from storage.
  let dismissed = false;
  function mount() { if (!dismissed && document.documentElement && !host.isConnected) document.documentElement.append(host); }
  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document, {childList: true, subtree: true});
  const card = shadow.querySelector('.card');
  let current;
  function render(state) {
    current = state;
    const fresh = state && Date.now() - state.updatedAt < 15000;
    const score = fresh ? state.score : null;
    const warning = state?.status?.startsWith('warning');
    const tone = score === null ? '#94a3b8' : state.status === 'warning_multi' || score < 70 ? '#fb7185' : warning || score < 85 ? '#fbbf24' : '#34d399';
    card.style.setProperty('--tone', tone);
    shadow.querySelector('.score').textContent = score === null ? '—' : `${score}점`;
    shadow.querySelector('.state').textContent = score === null ? fresh && state.status === 'neutral' ? '인식 / 기준 설정 확인' : '분석 대기 · 클릭하여 열기' : tone === '#fb7185' ? '경고 · 자세를 바로 해주세요' : tone === '#fbbf24' ? '주의 · 자세를 확인해주세요' : '바른 자세';
    card.title = fresh ? state.message + ' · 클릭하여 분석 열기' : '클릭하여 자세 분석 열기';
  }
  card.addEventListener('click', () => chrome.runtime.sendMessage({type: 'open-monitor'}).catch(() => {}));
  shadow.querySelector('.close').addEventListener('click', () => {dismissed = true; observer.disconnect(); clearInterval(timer); chrome.storage.onChanged.removeListener(onChange); host.remove();});
  function onChange(changes, area) {if (area === 'local' && changes.postureState) render(changes.postureState.newValue);}
  chrome.storage.onChanged.addListener(onChange);
  function restore() {
    chrome.storage.local.get('postureState').then(({postureState}) => {
      if (!current || (postureState?.updatedAt || 0) >= (current.updatedAt || 0)) render(postureState);
    }).catch(() => {});
  }
  window.addEventListener('pageshow', () => {mount(); restore();});
  restore();
  const timer = setInterval(() => render(current), 3000);
})();
