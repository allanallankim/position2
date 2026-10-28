// Uses the same ratios, thresholds, and score weights as the original dashboard.
function scorePosture(landmarks, baseline) {
  if (!landmarks || ![7, 8, 11, 12].every(index => landmarks[index])) return {status: 'neutral', score: null, message: '인물이 감지되지 않습니다'};
  const a = analyzePosture(landmarks);
  if (!a.detected || a.shoulderDist < 0.01) return {status: 'neutral', score: null, message: '상체가 잘 보이도록 위치를 맞춰주세요'};
  const turtle = Math.round(a.earShoulderRatio / (baseline?.earShoulderRatio > 0 ? baseline.earShoulderRatio : 0.42) * 100);
  const slouch = Math.round(a.torsoRatio / (baseline?.torsoRatio > 0 ? baseline.torsoRatio : baseline ? 1.4 : a.hasHips ? 1.4 : 0.42) * 100);
  let angle = a.shoulderAngle - (baseline?.shoulderAngle || 0);
  angle = ((angle + 540) % 360) - 180;
  const issues = [];
  if (turtle < 83) issues.push(['turtle', '거북목']);
  if (slouch < 84) issues.push(['slouch', '등굽음']);
  if (Math.abs(angle) >= 3.2) issues.push(['shoulder', '어깨 비대칭']);
  let score = 100;
  if (turtle < 92) score -= Math.min(35, Math.round((92 - turtle) * 1.8));
  if (slouch < 92) score -= Math.min(30, Math.round((92 - slouch) * 1.6));
  if (Math.abs(angle) > 1.5) score -= Math.min(35, Math.round((Math.abs(angle) - 1.5) * 6));
  return {
    score: Math.max(10, Math.min(100, score)),
    status: issues.length > 1 ? 'warning_multi' : issues.length ? `warning_${issues[0][0]}` : 'good',
    message: issues.length ? `${issues.map(issue => issue[1]).join(' · ')} 주의 · 자세를 바로 해주세요` : '바른 자세를 유지하고 있습니다'
  };
}
