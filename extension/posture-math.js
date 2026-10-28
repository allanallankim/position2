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

