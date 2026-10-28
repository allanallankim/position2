
    (function () {
      'use strict';

      // --- Cookie Storage Helpers (Standard document.cookie API) ---
      function setCookie(name, value) { localStorage.setItem(name, value); }
      function getCookie(name) { return localStorage.getItem(name); }

      // --- Default Profile Definitions (Up to 5 Environments) ---
      const DEFAULT_PROFILES = [
        { id: 'profile-1', name: '사무실 (데스크탑)', icon: '🖥️', isCalibrated: false, data: null },
        { id: 'profile-2', name: '노트북 / 카페', icon: '💻', isCalibrated: false, data: null },
        { id: 'profile-3', name: '스탠딩 데스크', icon: '🧍', isCalibrated: false, data: null },
        { id: 'profile-4', name: '독서 / 필기', icon: '📖', isCalibrated: false, data: null },
        { id: 'profile-5', name: '커스텀 환경', icon: '⚙️', isCalibrated: false, data: null }
      ];

      let profiles = [];
      let activeProfileId = 'profile-1';

      // Load Profiles from Cookie
      function loadProfilesFromCookie() {
        try {
          const cookieData = getCookie('pg_posture_profiles');
          const savedActiveId = getCookie('pg_active_profile_id');

          if (cookieData) {
            const parsed = JSON.parse(cookieData);
            if (Array.isArray(parsed) && parsed.length > 0) {
              profiles = parsed;
            } else {
              profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
            }
          } else {
            profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
          }

          if (savedActiveId && profiles.some(p => p.id === savedActiveId)) {
            activeProfileId = savedActiveId;
          } else {
            activeProfileId = profiles[0].id;
          }
        } catch (e) {
          console.warn('Failed to parse posture profiles cookie:', e);
          profiles = JSON.parse(JSON.stringify(DEFAULT_PROFILES));
          activeProfileId = profiles[0].id;
        }
      }

      // Save Profiles to Cookie with Compact Landmark Compression
      function saveProfilesToCookie() {
        try {
          // Compact profile data to stay well within 4KB cookie limit
          const compactProfiles = profiles.map(p => {
            if (!p.isCalibrated || !p.data) {
              return { id: p.id, name: p.name, icon: p.icon, isCalibrated: false, data: null };
            }
            
            // Compress ghost landmarks to only critical 11 joints with 3 decimal precision
            const compactGhost = {};
            if (p.data.landmarks) {
              const criticalIndices = [0, 7, 8, 11, 12, 13, 14, 23, 24];
              criticalIndices.forEach(idx => {
                const lm = p.data.landmarks[idx];
                if (lm) {
                  compactGhost[idx] = [
                    Math.round(lm.x * 1000) / 1000,
                    Math.round(lm.y * 1000) / 1000
                  ];
                }
              });
            }

            return {
              id: p.id,
              name: p.name,
              icon: p.icon,
              isCalibrated: true,
              data: {
                earShoulderRatio: Math.round(p.data.earShoulderRatio * 1000) / 1000,
                torsoRatio: Math.round(p.data.torsoRatio * 1000) / 1000,
                shoulderAngle: Math.round(p.data.shoulderAngle * 100) / 100,
                hasHips: !!p.data.hasHips,
                compactGhost: compactGhost
              }
            };
          });

          const serialized = JSON.stringify(compactProfiles);
          setCookie('pg_posture_profiles', serialized, 365);
          setCookie('pg_active_profile_id', activeProfileId, 365);
        } catch (err) {
          console.error('Failed to save posture profiles to cookie:', err);
        }
      }

      // --- DOM Elements ---
      const videoElement = document.getElementById('webcam');
      const canvasElement = document.getElementById('output-canvas');
      const canvasCtx = canvasElement.getContext('2d');
      const videoCard = document.getElementById('video-card');
      const statusGlow = document.getElementById('status-glow');

      // Profile Elements
      const profileSelect = document.getElementById('profile-select');
      const btnRenameProfile = document.getElementById('btn-rename-profile');
      const btnCalibrateText = document.getElementById('btn-calibrate-text');
      const countdownTargetProfile = document.getElementById('countdown-target-profile');
      const renameProfileModal = document.getElementById('rename-profile-modal');
      const inputProfileName = document.getElementById('input-profile-name');
      const btnCancelRename = document.getElementById('btn-cancel-rename');
      const btnSaveRename = document.getElementById('btn-save-rename');

      // HUD / Status Pills
      const statusPill = document.getElementById('status-pill');
      const statusPillDot = document.getElementById('status-pill-dot');
      const statusPillText = document.getElementById('status-pill-text');
      const calibIndicatorDot = document.getElementById('calib-indicator-dot');
      const calibIndicatorText = document.getElementById('calib-indicator-text');
      const fpsDisplay = document.getElementById('fps-display');
      const toastContainer = document.getElementById('toast-container');
      const spineModeBadge = document.getElementById('spine-mode-badge');

      // Metric Elements
      const overallScoreText = document.getElementById('overall-score-text');
      const scoreCircle = document.getElementById('score-circle');
      const scoreBadge = document.getElementById('score-badge');
      const statusDetailedSummary = document.getElementById('status-detailed-summary');
      const statusAdviceText = document.getElementById('status-advice-text');

      // Metric 1: 등굽음
      const slouchBadge = document.getElementById('slouch-badge');
      const slouchValueText = document.getElementById('slouch-value-text');
      const slouchProgressBar = document.getElementById('slouch-progress-bar');

      // Metric 2: 거북목
      const turtleBadge = document.getElementById('turtle-badge');
      const turtleValueText = document.getElementById('turtle-value-text');
      const turtleProgressBar = document.getElementById('turtle-progress-bar');

      // Metric 3: 어깨 비대칭
      const shoulderBadge = document.getElementById('shoulder-badge');
      const shoulderTiltText = document.getElementById('shoulder-tilt-text');
      const shoulderNeedle = document.getElementById('shoulder-needle');

      // Session Stats
      const goodPostureTimerText = document.getElementById('good-posture-timer');
      const warningCountDisplay = document.getElementById('warning-count-display');

      // Overlays & Buttons
      const initialOverlay = document.getElementById('initial-overlay');
      const btnInitCam = document.getElementById('btn-init-cam');
      const countdownOverlay = document.getElementById('countdown-overlay');
      const countdownCircle = document.getElementById('countdown-circle');
      const countdownNumber = document.getElementById('countdown-number');

      const btnToggleCam = document.getElementById('btn-toggle-cam');
      const btnCamText = document.getElementById('btn-cam-text');
      const btnCalibrate = document.getElementById('btn-calibrate');
      const btnResetBaseline = document.getElementById('btn-reset-baseline');

      const btnSoundToggle = document.getElementById('btn-sound-toggle');
      const iconSoundOn = document.getElementById('icon-sound-on');
      const iconSoundOff = document.getElementById('icon-sound-off');
      const soundStatusText = document.getElementById('sound-status-text');

      const btnMirrorToggle = document.getElementById('btn-mirror-toggle');
      const btnGhostToggle = document.getElementById('btn-ghost-toggle');
      const ghostStatusText = document.getElementById('ghost-status-text');

      // User Guide Modal Elements
      const userGuideModal = document.getElementById('user-guide-modal');
      const btnOpenGuide = document.getElementById('btn-open-guide');
      const btnOpenGuideInitial = document.getElementById('btn-open-guide-initial');
      const btnOpenGuideTips = document.getElementById('btn-open-guide-tips');
      const btnFooterGuide = document.getElementById('btn-footer-guide');
      const btnCloseGuide = document.getElementById('btn-close-guide');
      const btnCloseGuideFooter = document.getElementById('btn-close-guide-footer');
      const btnStartFromGuide = document.getElementById('btn-start-from-guide');

      // --- State Variables ---
      let pose = null;
      let camera = null;
      let isWebcamRunning = false;
      let soundEnabled = true;
      let mirrorMode = true;
      let showGhostGuideline = true;

      // Calibration Baseline for Active Profile
      let baseline = null;
      let isCalibrating = false;
      let calibrationSamples = [];

      // Evaluation Status: 'good' | 'warning_turtle' | 'warning_shoulder' | 'warning_slouch' | 'warning_multi' | 'neutral'
      let currentStatus = 'good';
      let badPostureFrameCount = 0; let badPostureSince = 0;
      let lastAudioAlertTime = 0;
      let goodPostureSeconds = 0;
      let warningCount = 0;
      let timerInterval = null;

      // FPS Calculation
      let lastFrameTime = performance.now();
      let frameCount = 0;

      // --- Profile UI Sync & Management ---
      function renderProfileSelect() {
        profileSelect.innerHTML = '';
        profiles.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          const statusText = p.isCalibrated ? '✓ 설정됨' : '미설정';
          opt.textContent = `${p.icon || '📌'} ${p.name} [${statusText}]`;
          if (p.id === activeProfileId) {
            opt.selected = true;
          }
          profileSelect.appendChild(opt);
        });

        syncActiveProfileBaseline();
      }

      function syncActiveProfileBaseline() {
        const cur = profiles.find(p => p.id === activeProfileId) || profiles[0];
        activeProfileId = cur.id;

        btnCalibrateText.textContent = `[${cur.name}] 기준 설정 (3초)`;
        countdownTargetProfile.textContent = `'${cur.name}' 환경 기준 설정 중`;

        if (cur.isCalibrated && cur.data) {
          // Reconstruct baseline from profile data
          baseline = {
            earShoulderRatio: cur.data.earShoulderRatio,
            torsoRatio: cur.data.torsoRatio,
            shoulderAngle: cur.data.shoulderAngle,
            hasHips: cur.data.hasHips,
            landmarks: cur.data.landmarks || null,
            compactGhost: cur.data.compactGhost || null
          };

          calibIndicatorDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse';
          calibIndicatorText.textContent = `기준 설정됨 (${cur.name})`;
          updateStatusUI('good', `'${cur.name}' 환경 기준 적용 완료`);
        } else {
          baseline = null;
          calibIndicatorDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse';
          calibIndicatorText.textContent = `기준 미설정 (${cur.name} - 3초 설정 필요)`;
          updateStatusUI('neutral', `'${cur.name}' 기준 설정을 진행해주세요.`);
        }
      }

      profileSelect.addEventListener('change', (e) => {
        activeProfileId = e.target.value;
        setCookie('pg_active_profile_id', activeProfileId, 365);
        syncActiveProfileBaseline();
        const cur = profiles.find(p => p.id === activeProfileId);
        showToast(`'${cur.name}' 환경으로 전환되었습니다.`, cur.isCalibrated ? 'success' : 'info');
      });

      // Rename Profile Modal
      btnRenameProfile.addEventListener('click', () => {
        const cur = profiles.find(p => p.id === activeProfileId);
        if (cur) {
          inputProfileName.value = cur.name;
          renameProfileModal.classList.remove('hidden');
          inputProfileName.focus();
        }
      });

      btnCancelRename.addEventListener('click', () => {
        renameProfileModal.classList.add('hidden');
      });

      btnSaveRename.addEventListener('click', () => {
        const newName = inputProfileName.value.trim();
        if (newName) {
          const cur = profiles.find(p => p.id === activeProfileId);
          if (cur) {
            cur.name = newName;
            saveProfilesToCookie();
            renderProfileSelect();
            showToast(`환경 이름이 '${newName}'(으)로 변경되었습니다.`, 'success');
          }
        }
        renameProfileModal.classList.add('hidden');
      });

      // --- User Guide Modal Controls ---
      function openGuideModal() {
        userGuideModal.classList.remove('hidden');
        document.body.classList.add('overflow-hidden');
      }

      function closeGuideModal() {
        userGuideModal.classList.add('hidden');
        document.body.classList.remove('overflow-hidden');
      }

      [btnOpenGuide, btnOpenGuideInitial, btnOpenGuideTips, btnFooterGuide].forEach(btn => {
        if (btn) btn.addEventListener('click', openGuideModal);
      });

      [btnCloseGuide, btnCloseGuideFooter].forEach(btn => {
        if (btn) btn.addEventListener('click', closeGuideModal);
      });

      if (btnStartFromGuide) {
        btnStartFromGuide.addEventListener('click', () => {
          closeGuideModal();
          if (!isWebcamRunning) {
            startCamera();
          }
        });
      }

      userGuideModal.addEventListener('click', (e) => {
        if (e.target === userGuideModal) {
          closeGuideModal();
        }
      });

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !userGuideModal.classList.contains('hidden')) {
          closeGuideModal();
        }
      });

      // --- Toast Notification Helper ---
      function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const bgColors = {
          info: 'bg-slate-900/90 border-slate-700 text-slate-200',
          success: 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200',
          warning: 'bg-amber-950/90 border-amber-500/50 text-amber-200'
        };
        toast.className = `px-4 py-2.5 rounded-xl border backdrop-blur-md shadow-xl text-xs font-semibold flex items-center space-x-2 transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto ${bgColors[type] || bgColors.info}`;
        toast.innerHTML = `<span>${message}</span>`;
        toastContainer.appendChild(toast);

        requestAnimationFrame(() => {
          toast.classList.remove('translate-y-2', 'opacity-0');
        });

        setTimeout(() => {
          toast.classList.add('opacity-0', '-translate-y-2');
          setTimeout(() => toast.remove(), 300);
        }, 3200);
      }

      // --- Pure Web Audio API Chime Synthesizer ---
      let audioCtx = null;
      function initAudio() {
        if (!audioCtx) {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (AudioContext) {
            audioCtx = new AudioContext();
          }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
          audioCtx.resume();
        }
      }

      function playTone(freq, duration, type = 'sine', volume = 0.12) {
        if (!soundEnabled) return;
        try {
          initAudio();
          if (!audioCtx) return;
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = type;
          osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
          gain.gain.setValueAtTime(volume, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);

          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + duration);
        } catch (e) {
          console.warn('Audio tone error:', e);
        }
      }

      function playSuccessTone() {
        if (!soundEnabled) return;
        playTone(523.25, 0.12, 'triangle', 0.15); // C5
        setTimeout(() => playTone(659.25, 0.12, 'triangle', 0.15), 100); // E5
        setTimeout(() => playTone(783.99, 0.25, 'triangle', 0.18), 200); // G5
      }

      function playWarningTone() {
        if (!soundEnabled) return;
        playTone(392.00, 0.15, 'sine', 0.18); // G4
        setTimeout(() => playTone(329.63, 0.25, 'sine', 0.18), 120); // E4
      }

      function playBeep(freq = 440) {
        playTone(freq, 0.08, 'sine', 0.1);
      }

      // --- User Controls & Toggles ---
      btnSoundToggle.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        if (soundEnabled) {
          iconSoundOn.classList.remove('hidden');
          iconSoundOff.classList.add('hidden');
          soundStatusText.textContent = '알림음 켬';
          initAudio();
          playTone(600, 0.1);
          showToast('알림음이 켜졌습니다.', 'info');
        } else {
          iconSoundOn.classList.add('hidden');
          iconSoundOff.classList.remove('hidden');
          soundStatusText.textContent = '음소거';
          showToast('알림음이 음소거되었습니다.', 'info');
        }
      });

      btnMirrorToggle.addEventListener('click', () => {
        mirrorMode = !mirrorMode;
        if (mirrorMode) {
          canvasElement.classList.add('mirror-mode');
          showToast('거울 모드가 켜졌습니다.', 'info');
        } else {
          canvasElement.classList.remove('mirror-mode');
          showToast('거울 모드가 꺼졌습니다.', 'info');
        }
      });

      btnGhostToggle.addEventListener('click', () => {
        showGhostGuideline = !showGhostGuideline;
        ghostStatusText.textContent = showGhostGuideline ? '기준선 ON' : '기준선 OFF';
        showToast(showGhostGuideline ? '기준 자세 가이드선이 켜졌습니다.' : '기준 자세 가이드선이 숨겨졌습니다.', 'info');
      });

      // --- Good Posture Session Timer ---
      function startPostureTimer() {
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = setInterval(() => {
          if (isWebcamRunning && currentStatus === 'good') {
            goodPostureSeconds++;
            const mins = String(Math.floor(goodPostureSeconds / 60)).padStart(2, '0');
            const secs = String(goodPostureSeconds % 60).padStart(2, '0');
            goodPostureTimerText.textContent = `${mins}:${secs}`;
          }
        }, 1000);
      }

      // --- MediaPipe Pose Initialization ---
      function initializePose() {
        pose = new Pose({
          locateFile: (file) => `vendor/pose/${file}`
        });

        pose.setOptions({
          modelComplexity: 1,
          smoothLandmarks: true,
          enableSegmentation: false,
          smoothSegmentation: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        pose.onResults(onPoseResults);
      }

      // --- Webcam Control with Camera Utils ---
      async function startCamera() {
        try {
          initAudio();
          if (!pose) {
            initializePose();
          }

          if (!camera) {
            camera = new Camera(videoElement, {
              onFrame: async () => {
                if (!isWebcamRunning) return;
                try {
                  await pose.send({ image: videoElement });
                } catch (err) {
                  console.error('Pose estimation error:', err); updateStatusUI('neutral', '분석 오류 · 카메라를 재시작해주세요');
                }
              },
              width: 640,
              height: 480
            });
          }

          await camera.start();
          isWebcamRunning = true;
          initialOverlay.classList.add('hidden');
          btnCamText.textContent = '일시 정지';
          startPostureTimer();
          
          const cur = profiles.find(p => p.id === activeProfileId);
          if (cur && cur.isCalibrated) {
            updateStatusUI('good', `'${cur.name}' 기준 자세 모니터링 중입니다.`);
            showToast(`웹캠 연결 완료! '${cur.name}' 기준을 적용합니다.`, 'success');
          } else {
            updateStatusUI('neutral', `웹캠 연결 완료. '${cur.name}' 기준을 설정해주세요.`);
            showToast('웹캠이 연결되었습니다! 3초 기준 설정을 진행해주세요.', 'info');
          }
        } catch (error) {
          console.error('Camera access failed:', error);
          alert('웹캠을 실행할 수 없습니다. 브라우저 설정에서 카메라 권한이 허용되어 있는지 확인해 주세요.');
        }
      }

      function stopCamera() {
        isWebcamRunning = false;
        if (camera) camera.stop().catch(error => alert(error.message));
        btnCamText.textContent = '카메라 재개';
        updateStatusUI('paused', '웹캠이 일시 정지되었습니다.');
        showToast('웹캠이 일시 정지되었습니다.', 'info');
      }

      btnInitCam.addEventListener('click', startCamera);
      btnToggleCam.addEventListener('click', () => {
        if (isWebcamRunning) {
          stopCamera();
        } else {
          startCamera();
        }
      });

      // --- Calibration Workflow (3 Seconds) ---
      btnCalibrate.addEventListener('click', startCalibrationCountdown);
      btnResetBaseline.addEventListener('click', resetBaseline);

      function resetBaseline() {
        const cur = profiles.find(p => p.id === activeProfileId);
        if (cur) {
          cur.isCalibrated = false;
          cur.data = null;
          saveProfilesToCookie();
          renderProfileSelect();
          showToast(`'${cur.name}' 환경의 기준 자세가 초기화되었습니다.`, 'info');
        }
      }

      function startCalibrationCountdown() {
        if (!isWebcamRunning) {
          alert('먼저 웹캠을 시작해주세요.');
          return;
        }
        if (isCalibrating) return;

        initAudio();
        isCalibrating = true;
        calibrationSamples = [];
        countdownOverlay.classList.remove('hidden');

        let remaining = 3;
        countdownNumber.textContent = remaining;
        const totalCircumference = 477;
        countdownCircle.style.strokeDashoffset = '0';
        playBeep(440);

        const countInterval = setInterval(() => {
          remaining--;
          if (remaining > 0) {
            countdownNumber.textContent = remaining;
            const progress = (3 - remaining) / 3;
            countdownCircle.style.strokeDashoffset = String(totalCircumference * progress);
            playBeep(440);
          } else {
            clearInterval(countInterval);
            countdownNumber.textContent = '측정';
            playBeep(880);
            
            // Sample for 0.6 seconds
            setTimeout(() => {
              finishCalibration();
            }, 600);
          }
        }, 1000);
      }

      function finishCalibration() {
        countdownOverlay.classList.add('hidden');
        isCalibrating = false;

        if (calibrationSamples.length === 0) {
          alert('인물이 감지되지 않아 기준점을 설정하지 못했습니다. 화면 중앙에 상체가 보이도록 앉아주세요.');
          return;
        }

        // Average sampled metrics
        let totalEarRatio = 0;
        let totalTorsoRatio = 0;
        let totalAngle = 0;
        let hipCount = 0;
        const avgLandmarks = [];
        const numSamples = calibrationSamples.length;
        const numPoints = calibrationSamples[0].landmarks.length;

        for (let i = 0; i < numPoints; i++) {
          avgLandmarks.push({ x: 0, y: 0, z: 0, visibility: 0 });
        }

        calibrationSamples.forEach(sample => {
          totalEarRatio += sample.earShoulderRatio;
          totalTorsoRatio += sample.torsoRatio;
          totalAngle += sample.shoulderAngle;
          if (sample.hasHips) hipCount++;
          sample.landmarks.forEach((lm, idx) => {
            avgLandmarks[idx].x += lm.x / numSamples;
            avgLandmarks[idx].y += lm.y / numSamples;
            avgLandmarks[idx].z += (lm.z || 0) / numSamples;
            avgLandmarks[idx].visibility += (lm.visibility || 0) / numSamples;
          });
        });

        // Save to active profile & Cookie!
        const cur = profiles.find(p => p.id === activeProfileId);
        if (cur) {
          cur.isCalibrated = true;
          cur.data = {
            earShoulderRatio: totalEarRatio / numSamples,
            torsoRatio: totalTorsoRatio / numSamples,
            shoulderAngle: totalAngle / numSamples,
            hasHips: (hipCount / numSamples) > 0.5,
            landmarks: avgLandmarks
          };

          saveProfilesToCookie();
          renderProfileSelect();
        }

        playSuccessTone();
        showToast(`🎉 '${cur ? cur.name : ''}' 기준이 쿠키에 안전하게 저장되었습니다!`, 'success');
      }

      // --- Mathematical Posture Analysis ---
      function analyzePosture(landmarks) {
        const leftEar = landmarks[7];
        const rightEar = landmarks[8];
        const leftShoulder = landmarks[11];
        const rightShoulder = landmarks[12];
        const leftHip = landmarks[23];
        const rightHip = landmarks[24];

        const minVisibility = 0.5;
        if (
          (leftShoulder.visibility < minVisibility && rightShoulder.visibility < minVisibility) ||
          (leftEar.visibility < minVisibility && rightEar.visibility < minVisibility)
        ) {
          return { detected: false };
        }

        // 1. Shoulder Distance (Invariant scale factor)
        const dx = leftShoulder.x - rightShoulder.x;
        const dy = leftShoulder.y - rightShoulder.y;
        const shoulderDist = Math.sqrt(dx * dx + dy * dy);

        // Shoulder Tilt Angle in degrees
        const shoulderAngle = Math.atan2(dy, dx) * (180 / Math.PI);

        // 2. Forward Head Posture (Turtle Neck)
        const midEarY = (leftEar.y + rightEar.y) / 2;
        const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;
        const verticalEarShoulderDist = midShoulderY - midEarY;
        const earShoulderRatio = shoulderDist > 0 ? (verticalEarShoulderDist / shoulderDist) : 0;

        // 3. Hunched Back & Slouching (등굽음 / 척추 압축)
        const hasHips = (leftHip && rightHip && leftHip.visibility > 0.35 && rightHip.visibility > 0.35);
        let torsoRatio = 0;

        if (hasHips) {
          const midHipY = (leftHip.y + rightHip.y) / 2;
          const verticalTorsoDist = midHipY - midShoulderY;
          torsoRatio = shoulderDist > 0 ? (verticalTorsoDist / shoulderDist) : 0;
        } else {
          torsoRatio = earShoulderRatio;
        }

        return {
          detected: true,
          shoulderAngle: shoulderAngle,
          shoulderDist: shoulderDist,
          earShoulderRatio: earShoulderRatio,
          torsoRatio: torsoRatio,
          hasHips: hasHips,
          landmarks: landmarks
        };
      }

      // --- MediaPipe onResults Callback ---
      function onPoseResults(results) {
        if (!isWebcamRunning) return;
        frameCount++;
        const now = performance.now();
        if (now - lastFrameTime >= 1000) {
          fpsDisplay.textContent = Math.round((frameCount * 1000) / (now - lastFrameTime));
          frameCount = 0;
          lastFrameTime = now;
        }

        if (canvasElement.width !== videoElement.videoWidth || canvasElement.height !== videoElement.videoHeight) {
          if (videoElement.videoWidth > 0 && videoElement.videoHeight > 0) {
            canvasElement.width = videoElement.videoWidth;
            canvasElement.height = videoElement.videoHeight;
          }
        }

        const width = canvasElement.width;
        const height = canvasElement.height;

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, width, height);

        if (results.image) {
          canvasCtx.drawImage(results.image, 0, 0, width, height);
        }

        if (!results.poseLandmarks) {
          canvasCtx.restore();
          updateStatusUI('neutral', '인물이 감지되지 않습니다');
          return;
        }

        const landmarks = results.poseLandmarks;
        const analysis = analyzePosture(landmarks);

        if (isCalibrating && analysis.detected) {
          calibrationSamples.push(analysis);
        }

        let isTurtleNeck = false;
        let isShoulderImbalance = false;
        let isSlouching = false;

        let turtleRatioPercent = 100;
        let slouchRatioPercent = 100;
        let shoulderAngleDiff = 0;
        let tiltDirectionText = '균형';

        if (analysis.detected) {
          if (analysis.hasHips) {
            spineModeBadge.textContent = '척추 전신 추적';
            spineModeBadge.className = 'text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-400 font-mono border border-emerald-500/30';
          } else {
            spineModeBadge.textContent = '상체 추적 모드';
            spineModeBadge.className = 'text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-mono border border-slate-700';
          }

          if (baseline) {
            turtleRatioPercent = Math.round((analysis.earShoulderRatio / baseline.earShoulderRatio) * 100);
            shoulderAngleDiff = analysis.shoulderAngle - baseline.shoulderAngle;
            
            const baseTorso = baseline.torsoRatio > 0 ? baseline.torsoRatio : 1.4;
            slouchRatioPercent = Math.round((analysis.torsoRatio / baseTorso) * 100);
          } else {
            turtleRatioPercent = Math.round((analysis.earShoulderRatio / 0.42) * 100);
            shoulderAngleDiff = analysis.shoulderAngle;
            slouchRatioPercent = Math.round((analysis.torsoRatio / (analysis.hasHips ? 1.40 : 0.42)) * 100);
          }

          // Thresholds
          if (turtleRatioPercent < 83) isTurtleNeck = true;
          if (slouchRatioPercent < 84) isSlouching = true;
          if (Math.abs(shoulderAngleDiff) >= 3.2) isShoulderImbalance = true;

          if (shoulderAngleDiff < -1.5) {
            tiltDirectionText = '좌측 어깨 높음';
          } else if (shoulderAngleDiff > 1.5) {
            tiltDirectionText = '우측 어깨 높음';
          } else {
            tiltDirectionText = '균형';
          }
        }

        let frameStatus = 'good';
        const curProfile = profiles.find(p => p.id === activeProfileId);
        const profileName = curProfile ? curProfile.name : '기본';

        let statusMsg = baseline ? `자세가 좋습니다 (${profileName}) 😊` : `자세가 좋습니다 😊`;
        let adviceMsg = '바른 척추 정렬을 유지하고 있습니다. 주기적으로 어깨와 등을 펴 스트레칭해주세요.';

        const issuesCount = (isTurtleNeck ? 1 : 0) + (isShoulderImbalance ? 1 : 0) + (isSlouching ? 1 : 0);

        if (!analysis.detected) {
          frameStatus = 'neutral';
          statusMsg = '상체가 잘 보이도록 위치를 맞춰주세요';
          adviceMsg = '카메라 렌즈를 향해 얼굴과 어깨가 충분히 나오도록 의자 위치를 조절해주세요.';
        } else if (issuesCount >= 2) {
          frameStatus = 'warning_multi';
          const issues = [];
          if (isSlouching) issues.push('등굽음');
          if (isTurtleNeck) issues.push('거북목');
          if (isShoulderImbalance) issues.push('어깨비대칭');
          statusMsg = `${issues.join(' & ')} 복합 주의! 🚨`;
          adviceMsg = '가슴과 등을 곧게 펴고, 턱을 뒤로 당겨 척추를 일직선으로 정렬하세요!';
        } else if (isSlouching) {
          frameStatus = 'warning_slouch';
          statusMsg = '등굽음 주의! 허리와 가슴을 펴세요 ⚠️';
          adviceMsg = '등이 구부정하게 말려 있습니다. 명치를 살짝 들어 올리고 등을 곧게 세워주세요.';
        } else if (isTurtleNeck) {
          frameStatus = 'warning_turtle';
          statusMsg = '거북목 주의! 어깨를 펴고 턱을 당기세요 ⚠️';
          adviceMsg = '머리가 앞으로 쏠려 있습니다. 턱을 가볍게 뒤로 당기고 목을 세워주세요.';
        } else if (isShoulderImbalance) {
          frameStatus = 'warning_shoulder';
          statusMsg = `어깨 비대칭 주의! (${tiltDirectionText}) ⚖️`;
          adviceMsg = '한쪽 어깨로 체중이 쏠려 있습니다. 양쪽 골반과 어깨 수평을 맞춰주세요.';
        }

        drawSkeleton(canvasCtx, landmarks, width, height, frameStatus, baseline, analysis);
        updateMetricsUI(frameStatus, turtleRatioPercent, slouchRatioPercent, shoulderAngleDiff, tiltDirectionText, statusMsg, adviceMsg, analysis.hasHips);
        handleFeedbackAlerts(frameStatus);

        canvasCtx.restore();
      }

      // --- Draw Skeleton & HUD Overlay onto Canvas ---
      function drawSkeleton(ctx, lms, w, h, status, base, analysis) {
        if (showGhostGuideline && base) {
          drawGhostGuideline(ctx, base, w, h);
        }

        let jointColor = '#10b981';
        let shoulderColor = '#10b981';
        let neckColor = '#10b981';
        let spineColor = '#10b981';

        if (status === 'warning_multi') {
          jointColor = '#ef4444';
          shoulderColor = '#ef4444';
          neckColor = '#ef4444';
          spineColor = '#ef4444';
        } else if (status === 'warning_slouch') {
          spineColor = '#f59e0b';
          jointColor = '#f59e0b';
        } else if (status === 'warning_turtle') {
          neckColor = '#f59e0b';
          jointColor = '#f59e0b';
        } else if (status === 'warning_shoulder') {
          shoulderColor = '#f59e0b';
          jointColor = '#f59e0b';
        }

        // Connectors
        const connections = [
          [0, 1], [1, 2], [2, 3], [3, 7],
          [0, 4], [4, 5], [5, 6], [6, 8],
          [11, 12],
          [11, 13], [13, 15],
          [12, 14], [14, 16],
          [11, 23], [12, 24], [23, 24]
        ];

        connections.forEach(([p1, p2]) => {
          const pt1 = lms[p1];
          const pt2 = lms[p2];
          if (!pt1 || !pt2) return;
          if ((pt1.visibility || 0) < 0.35 || (pt2.visibility || 0) < 0.35) return;

          let lineColor = 'rgba(255, 255, 255, 0.4)';
          let lineWidth = 3;

          if ((p1 === 11 && p2 === 12) || (p1 === 12 && p2 === 11)) {
            lineColor = shoulderColor;
            lineWidth = (status === 'warning_shoulder' || status === 'warning_multi') ? 5 : 3.5;
          }

          ctx.beginPath();
          ctx.moveTo(pt1.x * w, pt1.y * h);
          ctx.lineTo(pt2.x * w, pt2.y * h);
          ctx.strokeStyle = lineColor;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = 'round';
          ctx.stroke();
        });

        // Neck line
        const leftEar = lms[7];
        const rightEar = lms[8];
        const leftShoulder = lms[11];
        const rightShoulder = lms[12];
        const leftHip = lms[23];
        const rightHip = lms[24];

        let midEar = null;
        let midShoulder = null;
        let midHip = null;

        if (leftEar && rightEar && leftShoulder && rightShoulder) {
          midEar = { x: (leftEar.x + rightEar.x) / 2, y: (leftEar.y + rightEar.y) / 2 };
          midShoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };

          ctx.beginPath();
          ctx.setLineDash((status === 'warning_turtle' || status === 'warning_multi') ? [6, 4] : []);
          ctx.moveTo(midEar.x * w, midEar.y * h);
          ctx.lineTo(midShoulder.x * w, midShoulder.y * h);
          ctx.strokeStyle = neckColor;
          ctx.lineWidth = (status === 'warning_turtle' || status === 'warning_multi') ? 4.5 : 2.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Spine Line
        if (midShoulder) {
          ctx.beginPath();
          if (leftHip && rightHip && leftHip.visibility > 0.35 && rightHip.visibility > 0.35) {
            midHip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
            ctx.moveTo(midShoulder.x * w, midShoulder.y * h);
            ctx.lineTo(midHip.x * w, midHip.y * h);
          } else {
            ctx.moveTo(midShoulder.x * w, midShoulder.y * h);
            ctx.lineTo(midShoulder.x * w, (midShoulder.y + 0.25) * h);
          }

          ctx.setLineDash((status === 'warning_slouch' || status === 'warning_multi') ? [5, 4] : [2, 2]);
          ctx.strokeStyle = spineColor;
          ctx.lineWidth = (status === 'warning_slouch' || status === 'warning_multi') ? 5 : 2.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Horizontal Guide
        if (leftShoulder && rightShoulder) {
          const midY = ((leftShoulder.y + rightShoulder.y) / 2) * h;
          const leftX = Math.min(leftShoulder.x, rightShoulder.x) * w - 30;
          const rightX = Math.max(leftShoulder.x, rightShoulder.x) * w + 30;

          ctx.beginPath();
          ctx.setLineDash([4, 4]);
          ctx.moveTo(leftX, midY);
          ctx.lineTo(rightX, midY);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Key Joint Dots
        const keyJoints = [0, 7, 8, 11, 12, 13, 14, 23, 24];
        keyJoints.forEach(idx => {
          const pt = lms[idx];
          if (!pt || (pt.visibility || 0) < 0.35) return;

          const cx = pt.x * w;
          const cy = pt.y * h;

          let dotColor = jointColor;
          let radius = 5;

          if (idx === 11 || idx === 12) {
            radius = 7;
            dotColor = (status === 'warning_shoulder' || status === 'warning_multi') ? '#ef4444' : '#38bdf8';
          } else if (idx === 7 || idx === 8) {
            radius = 6;
            dotColor = (status === 'warning_turtle' || status === 'warning_multi') ? '#ef4444' : '#2dd4bf';
          } else if (idx === 23 || idx === 24) {
            radius = 6;
            dotColor = (status === 'warning_slouch' || status === 'warning_multi') ? '#ef4444' : '#a78bfa';
          }

          ctx.beginPath();
          ctx.arc(cx, cy, radius + 3, 0, 2 * Math.PI);
          ctx.fillStyle = dotColor + '40';
          ctx.fill();

          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
          ctx.fillStyle = dotColor;
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();
        });
      }

      // Draw Baseline Ghost Guideline (supports full or compact cookie points)
      function drawGhostGuideline(ctx, base, w, h) {
        ctx.save();
        ctx.strokeStyle = 'rgba(45, 212, 191, 0.45)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);

        function getPoint(idx) {
          if (base.landmarks && base.landmarks[idx]) {
            return { x: base.landmarks[idx].x * w, y: base.landmarks[idx].y * h };
          }
          if (base.compactGhost && base.compactGhost[idx]) {
            return { x: base.compactGhost[idx][0] * w, y: base.compactGhost[idx][1] * h };
          }
          return null;
        }

        const connections = [
          [11, 12], [11, 13], [12, 14], [11, 23], [12, 24], [23, 24]
        ];

        connections.forEach(([p1, p2]) => {
          const pt1 = getPoint(p1);
          const pt2 = getPoint(p2);
          if (!pt1 || !pt2) return;
          ctx.beginPath();
          ctx.moveTo(pt1.x, pt1.y);
          ctx.lineTo(pt2.x, pt2.y);
          ctx.stroke();
        });

        // Head guideline circle
        const ls = getPoint(11);
        const rs = getPoint(12);
        const nose = getPoint(0);
        if (ls && rs && nose) {
          const headRadius = Math.abs(rs.x - ls.x) * 0.32;
          ctx.beginPath();
          ctx.arc(nose.x, nose.y, headRadius, 0, 2 * Math.PI);
          ctx.stroke();
        }

        ctx.restore();
      }

      // --- Feedback Alert Management & Debouncing ---
      function handleFeedbackAlerts(status) {
        currentStatus = status;

        if (status.startsWith('warning')) {
          badPostureFrameCount++; if (!badPostureSince) badPostureSince = performance.now();
          const now = performance.now();
          if (now - badPostureSince >= 1200 && (now - lastAudioAlertTime > 4500)) {
            lastAudioAlertTime = now;
            warningCount++;
            warningCountDisplay.textContent = warningCount;
            playWarningTone();
          }
        } else {
          badPostureFrameCount = 0; badPostureSince = 0;
        }
      }

      // --- Update Dashboard Cards & UI Meters ---
      function updateMetricsUI(status, turtlePct, slouchPct, angleDiff, tiltText, statusMsg, adviceMsg, hasHips) {
        let postureScore = 100;
        
        if (turtlePct < 92) {
          const penalty = Math.min(35, Math.round((92 - turtlePct) * 1.8));
          postureScore -= penalty;
        }

        if (slouchPct < 92) {
          const penalty = Math.min(30, Math.round((92 - slouchPct) * 1.6));
          postureScore -= penalty;
        }

        const absAngle = Math.abs(angleDiff);
        if (absAngle > 1.5) {
          const penalty = Math.min(35, Math.round((absAngle - 1.5) * 6));
          postureScore -= penalty;
        }

        postureScore = Math.max(10, Math.min(100, postureScore));

        overallScoreText.textContent = postureScore;
        const dashOffset = 251.3 * (1 - postureScore / 100);
        scoreCircle.style.strokeDashoffset = String(dashOffset);

        if (postureScore >= 85) {
          scoreCircle.className.baseVal = 'text-emerald-500 transition-all duration-500 ease-out';
          scoreBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          scoreBadge.textContent = '최상 (Good)';
        } else if (postureScore >= 70) {
          scoreCircle.className.baseVal = 'text-amber-500 transition-all duration-500 ease-out';
          scoreBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20';
          scoreBadge.textContent = '주의 (Fair)';
        } else {
          scoreCircle.className.baseVal = 'text-rose-500 transition-all duration-500 ease-out';
          scoreBadge.className = 'px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20';
          scoreBadge.textContent = '위험 (Poor)';
        }

        // Slouch Meter
        const clampedSlouch = Math.max(40, Math.min(120, slouchPct));
        slouchValueText.textContent = `${slouchPct}%`;
        slouchProgressBar.style.width = `${Math.min(100, Math.max(10, (clampedSlouch - 40) * 1.25))}%`;

        if (slouchPct >= 89) {
          slouchBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          slouchBadge.textContent = '등 펴짐 (정상)';
          slouchProgressBar.className = 'bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300';
        } else if (slouchPct >= 83) {
          slouchBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
          slouchBadge.textContent = '약간 구부정 (주의)';
          slouchProgressBar.className = 'bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300';
        } else {
          slouchBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse';
          slouchBadge.textContent = '등굽음 감지 ⚠️';
          slouchProgressBar.className = 'bg-gradient-to-r from-rose-600 to-red-500 h-full rounded-full transition-all duration-300';
        }

        // Turtle Neck Meter
        const clampedTurtle = Math.max(40, Math.min(120, turtlePct));
        turtleValueText.textContent = `${turtlePct}%`;
        turtleProgressBar.style.width = `${Math.min(100, Math.max(10, (clampedTurtle - 40) * 1.25))}%`;

        if (turtlePct >= 88) {
          turtleBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          turtleBadge.textContent = '정상';
          turtleProgressBar.className = 'bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full transition-all duration-300';
        } else if (turtlePct >= 80) {
          turtleBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
          turtleBadge.textContent = '주의';
          turtleProgressBar.className = 'bg-gradient-to-r from-amber-500 to-yellow-400 h-full rounded-full transition-all duration-300';
        } else {
          turtleBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse';
          turtleBadge.textContent = '거북목 감지 ⚠️';
          turtleProgressBar.className = 'bg-gradient-to-r from-rose-600 to-red-500 h-full rounded-full transition-all duration-300';
        }

        // Shoulder Balance Meter
        const formattedAngle = Math.abs(angleDiff).toFixed(1);
        shoulderTiltText.textContent = `${formattedAngle}° (${tiltText})`;

        const maxRange = 12;
        const clampedDiff = Math.max(-maxRange, Math.min(maxRange, angleDiff));
        const needlePercent = 50 + (clampedDiff / maxRange) * 50;
        shoulderNeedle.style.left = `calc(${needlePercent}% - 5px)`;

        if (Math.abs(angleDiff) < 2.0) {
          shoulderBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          shoulderBadge.textContent = `수평 (${formattedAngle}°)`;
          shoulderNeedle.className = 'absolute w-2.5 h-4 bg-emerald-400 rounded-sm shadow-md transition-all duration-300';
        } else if (Math.abs(angleDiff) < 3.5) {
          shoulderBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20';
          shoulderBadge.textContent = `경미한 기울임 (${formattedAngle}°)`;
          shoulderNeedle.className = 'absolute w-2.5 h-4 bg-amber-400 rounded-sm shadow-md transition-all duration-300';
        } else {
          shoulderBadge.className = 'px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse';
          shoulderBadge.textContent = `어깨 비대칭 (${formattedAngle}°) ⚠️`;
          shoulderNeedle.className = 'absolute w-2.5 h-4 bg-rose-500 rounded-sm shadow-md transition-all duration-300';
        }

        // Detailed Summary Box
        statusDetailedSummary.textContent = statusMsg;
        statusAdviceText.textContent = adviceMsg;

        if (status === 'good') {
          statusDetailedSummary.className = 'text-base font-bold text-emerald-400 leading-snug';
        } else if (status.startsWith('warning')) {
          statusDetailedSummary.className = 'text-base font-bold text-rose-400 leading-snug';
        } else {
          statusDetailedSummary.className = 'text-base font-bold text-slate-300 leading-snug';
        }

        updateStatusUI(status, statusMsg);
      }

      function updateStatusUI(status, message) {
        statusPillText.textContent = message;

        if (status === 'good') {
          videoCard.className = 'relative bg-slate-900 rounded-2xl overflow-hidden border-2 border-emerald-500 shadow-2xl shadow-emerald-500/10 transition-all duration-300 aspect-[4/3] flex items-center justify-center';
          statusGlow.className = 'pointer-events-none absolute inset-0 rounded-2xl border-4 border-emerald-500/40 transition-all duration-300';
          statusPillDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0';
          statusPill.className = 'bg-slate-900/95 backdrop-blur-md border border-emerald-500/50 text-emerald-300 px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 text-sm font-semibold transition-all duration-300 max-w-md text-center';
        } else if (status.startsWith('warning')) {
          videoCard.className = 'relative bg-slate-900 rounded-2xl overflow-hidden border-2 border-rose-500 shadow-2xl shadow-rose-500/20 transition-all duration-300 aspect-[4/3] flex items-center justify-center';
          statusGlow.className = 'pointer-events-none absolute inset-0 rounded-2xl border-4 border-rose-500/50 transition-all duration-300 animate-pulse-fast';
          statusPillDot.className = 'w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping flex-shrink-0';
          statusPill.className = 'bg-rose-950/90 backdrop-blur-md border border-rose-500 text-rose-200 px-4 py-2 rounded-full shadow-lg shadow-rose-900/50 flex items-center space-x-2 text-sm font-bold transition-all duration-300 max-w-md text-center';
        } else {
          videoCard.className = 'relative bg-slate-900 rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl transition-all duration-300 aspect-[4/3] flex items-center justify-center';
          statusGlow.className = 'pointer-events-none absolute inset-0 rounded-2xl border-4 border-transparent transition-all duration-300';
          statusPillDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-400 animate-pulse flex-shrink-0';
          statusPill.className = 'bg-slate-900/90 backdrop-blur-md border border-slate-700 text-slate-300 px-4 py-2 rounded-full shadow-lg flex items-center space-x-2 text-sm font-semibold transition-all duration-300 max-w-md text-center';
        }
      }

      
      engineCommand('status').then(state => { if (state.running) startCamera(); }).catch(console.error);
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local' || !changes.postureState) return;
        const state = changes.postureState.newValue;
        if (!state.running && isWebcamRunning) {
          isWebcamRunning = false;
          if (camera) { camera.generation++; clearTimeout(camera.timer); }
          btnCamText.textContent = '카메라 재개';
          updateStatusUI('paused', state.message);
        }
      });
      // --- Initialization On Load ---
      loadProfilesFromCookie();
      renderProfileSelect();

      const initialActive = profiles.find(p => p.id === activeProfileId);
      if (initialActive && initialActive.isCalibrated) {
        showToast(`🍪 쿠키에서 '${initialActive.name}' 기준 자세를 성공적으로 불러왔습니다.`, 'success');
      }

    })();
  