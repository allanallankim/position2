(() => {
  if (document.getElementById('posture-guardian-widget')) return;
  const host = document.createElement('div');
  host.id = 'posture-guardian-widget';
  host.style.cssText = 'all:initial!important;position:fixed!important;right:20px!important;bottom:20px!important;z-index:2147483647!important;display:block!important;';
  const shadow = host.attachShadow({mode: 'closed'});
  shadow.innerHTML = `<style>
    :host{color-scheme:dark}button{font-family:system-ui,sans-serif;cursor:pointer}
    .card{--tone:#94a3b8;display:flex;align-items:center;justify-content:center;box-sizing:border-box;width:52px;height:52px;padding:0;background:#111827;border:2px solid var(--tone);border-radius:50%;box-shadow:0 3px 12px #0004;opacity:.5;transition:border-color .3s}
    .score{font-size:20px;font-weight:750;font-variant-numeric:tabular-nums;color:var(--tone);line-height:1}
    .close{position:absolute;right:-5px;top:-5px;border:1px solid #64748b;border-radius:50%;width:18px;height:18px;padding:0;background:#1e293b;color:white;font-size:12px;opacity:0;pointer-events:none}
    :host(:hover) .close,:host(:focus-within) .close{opacity:.5;pointer-events:auto}
    button:focus-visible{outline:3px solid #38bdf8;outline-offset:3px}
  </style><button class="card" aria-label="자세 분석 대기 · 클릭하여 열기" title="자세 분석 열기"><span class="score">—</span></button><button class="close" aria-label="이 페이지에서 위젯 숨기기" title="이 페이지에서 숨기기">×</button>`;
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
    shadow.querySelector('.score').textContent = score === null ? '—' : String(score);
    const statusText = score === null ? fresh && state.status === 'neutral' ? '인식 / 기준 설정 확인' : '분석 대기' : tone === '#fb7185' ? '경고 · 자세를 바로 해주세요' : tone === '#fbbf24' ? '주의 · 자세를 확인해주세요' : '바른 자세';
    card.ariaLabel = `${score === null ? '점수 없음' : `${score}점`} · ${statusText} · 클릭하여 자세 분석 열기`;
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
