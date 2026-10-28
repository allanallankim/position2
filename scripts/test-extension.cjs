const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('only offscreen engine can publish; no tab lifecycle can stop camera', async () => {
  const callbacks = {};
  const stored = {};
  const chrome = {
    runtime: {getURL: path => `chrome-extension://test/${path}`, onMessage: {addListener: cb => callbacks.message = cb}, onStartup: {addListener() {}}},
    action: {onClicked: {addListener() {}}},
    tabs: {onRemoved: {addListener: cb => callbacks.removed = cb}},
    storage: {local: {set: async data => Object.assign(stored, data), get: async () => stored}}
  };
  vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), {chrome});
  const update = {type: 'posture-update', score: 65, status: 'warning_multi', message: '경고'};
  callbacks.message(update, {url: 'https://example.com', tab: {id: 1}});
  assert.equal(stored.postureState, undefined);
  callbacks.message(update, {url: chrome.runtime.getURL('monitor.html'), tab: {id: 5}});
  assert.equal(stored.postureState, undefined);
  callbacks.message(update, {url: chrome.runtime.getURL('offscreen.html')}, () => {});
  assert.equal(stored.postureState.score, 65);
  callbacks.message({...update, score: NaN}, {url: chrome.runtime.getURL('offscreen.html')}, () => {});
  assert.equal(stored.postureState.score, 65);
  assert.equal(callbacks.removed, undefined);
  assert.equal(stored.postureState.tabId, undefined);
});

test('extension pages have no inline scripts or remote executable dependencies', () => {
  for (const page of ['monitor', 'offscreen']) {
    const html = fs.readFileSync(`extension/${page}.html`, 'utf8');
    assert.doesNotMatch(html, /<script>([\s\S]*?)<\/script>|<script[^>]+src="https?:/);
    for (const [, path] of html.matchAll(/<script src="([^"]+)"/g)) assert.ok(fs.existsSync(`extension/${path}`), path);
  }
  const manifest = JSON.parse(fs.readFileSync('extension/manifest.json'));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.permissions.includes('offscreen'));
  assert.equal(manifest.content_scripts[0].run_at, 'document_start');
  assert.ok(fs.existsSync('extension/vendor/pose/pose_landmark_full.tflite'));
});

test('concurrent monitor requests create one offscreen document and serialize start/stop', async () => {
  let listener, creates = 0, exists = false;
  const commands = [];
  const chrome = {
    runtime: {getURL: path => `chrome-extension://test/${path}`, getContexts: async () => exists ? [{}] : [],
      sendMessage: async data => {commands.push(data.command); return {running: data.command === 'start'};},
      onMessage: {addListener: cb => listener = cb}, onStartup: {addListener() {}}},
    offscreen: {createDocument: async () => {creates++; await Promise.resolve(); exists = true;}},
    action: {onClicked: {addListener() {}}}
  };
  vm.runInNewContext(fs.readFileSync('extension/background.js', 'utf8'), {chrome});
  const request = (command, url = chrome.runtime.getURL('monitor.html')) => new Promise(resolve => {
    const handled = listener({type: 'engine-command', command}, {url}, resolve);
    if (!handled) resolve('rejected');
  });
  assert.equal(await request('stop', 'https://example.com'), 'rejected');
  await Promise.all([request('start'), request('start'), request('stop'), request('status')]);
  assert.equal(creates, 1);
  assert.deepEqual(commands.filter(command => command !== 'status'), ['start', 'start', 'stop']);
});

function engineHarness() {
  let listener, acquired = 0, released = 0, sendCount = 0;
  let now = 1000;
  const timers = [];
  const updates = [];
  const video = {play: async () => {}};
  const context = {
    console,
    Date: class extends Date {static now() {return now;}},
    document: {getElementById: id => id === 'camera' ? video : {getContext: () => ({drawImage() {}}), toDataURL: () => 'data:image/jpeg;base64,test'}},
    navigator: {mediaDevices: {getUserMedia: async () => {acquired++; return {getTracks: () => [{stop() {released++;}}], getVideoTracks: () => [{addEventListener() {}}]};}}},
    localStorage: {getItem: () => null},
    scorePosture: () => ({status: 'good', score: 96, message: 'good'}),
    setTimeout: callback => {timers.push(callback); return timers.length;}, clearTimeout() {},
    chrome: {runtime: {id: 'test', getURL: path => `chrome-extension://test/${path}`, sendMessage: async data => updates.push(data), onMessage: {addListener: cb => listener = cb}}},
    Pose: class {setOptions() {} onResults(cb) {this.callback = cb;} async send() {sendCount++; this.callback({poseLandmarks: []});}}
  };
  vm.runInNewContext(fs.readFileSync('extension/offscreen.js', 'utf8'), context);
  const request = command => new Promise(resolve => listener({target: 'engine', command}, {id: 'test'}, resolve));
  return {request, timers, updates, advance: ms => now += ms, counts: () => ({acquired, released, sendCount})};
}

test('engine owns one camera, runs without monitor, releases on explicit stop, and restarts', async () => {
  const engine = engineHarness();
  await Promise.all([engine.request('start'), engine.request('start')]);
  assert.equal(engine.counts().acquired, 1);
  engine.advance(600);
  await engine.timers.shift()();
  assert.equal(engine.counts().sendCount, 1);
  assert.equal(engine.updates.at(-1).score, 96);
  assert.equal((await engine.request('status')).running, true);
  assert.equal(engine.counts().released, 0);
  await engine.request('stop');
  assert.equal(engine.counts().released, 1);
  assert.equal(engine.updates.at(-1).score, null);
  await engine.timers.shift()(); // Previously scheduled work must not reopen the camera.
  assert.equal(engine.counts().sendCount, 1);
  await engine.request('start');
  assert.equal(engine.counts().acquired, 2);
  await engine.request('stop');
});

test('posture score reports missing person, calibrated good posture, and combined warnings', () => {
  const context = {};
  vm.runInNewContext(fs.readFileSync('extension/posture-math.js', 'utf8') + fs.readFileSync('extension/posture-score.js', 'utf8'), context);
  assert.equal(context.scorePosture(null, null).score, null);
  const landmarks = Array.from({length: 33}, () => ({x: 0.5, y: 0.5, visibility: 1}));
  landmarks[7] = {x: 0.6, y: 0.3, visibility: 1};
  landmarks[8] = {x: 0.4, y: 0.3, visibility: 1};
  landmarks[11] = {x: 0.7, y: 0.5, visibility: 1};
  landmarks[12] = {x: 0.3, y: 0.5, visibility: 1};
  landmarks[23].y = landmarks[24].y = 0.9;
  const baseline = context.analyzePosture(landmarks);
  assert.equal(context.scorePosture(landmarks, baseline).score, 100);
  landmarks[7].y = landmarks[8].y = 0.49;
  landmarks[23].y = landmarks[24].y = 0.51;
  assert.equal(context.scorePosture(landmarks, baseline).status, 'warning_multi');
});

test('reopened monitor attaches to running engine without asking for camera again', async () => {
  let permissionRequests = 0, stops = 0;
  const context = {
    chrome: {runtime: {sendMessage: async message => {if (message.command === 'stop') stops++; return {running: message.command !== 'stop'};}}},
    navigator: {mediaDevices: {getUserMedia: async () => {permissionRequests++; throw new Error('Must not request a second camera');}}},
    document: {getElementById: () => ({})}, setTimeout: () => 1, clearTimeout() {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('extension/camera.js', 'utf8') + '\nglobalThis.camera = new Camera({}, {onFrame: async () => {}});', context);
  await context.camera.start();
  assert.equal(permissionRequests, 0);
  assert.equal(stops, 0);
  await context.camera.stop();
  assert.equal(stops, 1);
});

test('widget restores score on navigation, reattaches after root replacement, and refreshes on back navigation', async () => {
  let saved = {score: 92, status: 'good', message: '바른 자세', updatedAt: Date.now()};
  async function loadPage() {
    const nodes = {};
    const events = {};
    let mutation, appended = 0;
    const host = {style: {}, isConnected: false, attachShadow: () => ({set innerHTML(value) {}, querySelector: selector => nodes[selector] ||= {style: {setProperty() {}}, addEventListener() {}}})};
    const context = {
      document: {getElementById: () => null, createElement: () => host, documentElement: {append: () => {appended++; host.isConnected = true;}}},
      MutationObserver: class {constructor(callback) {mutation = callback;} observe() {} disconnect() {}},
      window: {addEventListener: (type, callback) => events[type] = callback},
      chrome: {storage: {local: {get: async () => ({postureState: saved})}, onChanged: {addListener() {}}}},
      setInterval() {}, clearInterval() {}
    };
    vm.runInNewContext(fs.readFileSync('extension/widget.js', 'utf8'), context);
    await Promise.resolve();
    return {nodes, events, host, mutation, appended: () => appended};
  }
  const first = await loadPage();
  assert.equal(first.nodes['.score'].textContent, '92');
  const nextPage = await loadPage();
  assert.equal(nextPage.nodes['.score'].textContent, '92');
  nextPage.host.isConnected = false;
  nextPage.mutation();
  assert.equal(nextPage.appended(), 2);
  saved = {...saved, score: 60, status: 'warning_multi', updatedAt: saved.updatedAt + 100};
  first.events.pageshow();
  await Promise.resolve();
  assert.equal(first.nodes['.score'].textContent, '60');
});
