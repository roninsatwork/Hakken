function matchedFrameIndexes(failures: string[], pattern: RegExp) {
  const indexes = new Set<number>();
  failures.forEach((failure) => {
    const match = pattern.exec(failure);
    pattern.lastIndex = 0;
    if (match) indexes.add(Number(match[1]));
  });
  return indexes;
}

function countMessage(label: string, count: number, frameCount: number, suffix: string) {
  return `${label} affected ${count}/${frameCount} moments. ${suffix}`;
}

export function summarizeMovementCommissioningFailures(
  failures: string[],
  frameCount: number,
) {
  const summaries: string[] = [];
  const consumed = new Set<string>();
  const profileFrames = matchedFrameIndexes(
    failures,
    /^Frame (\d+) has the wrong Deep Capture acquisition profile\.$/,
  );
  if (profileFrames.size > 0) {
    summaries.push(countMessage(
      "Internal capture-profile stamping",
      profileFrames.size,
      frameCount,
      "This is a software fault, not a movement or positioning mistake.",
    ));
  }
  const denseFrames = matchedFrameIndexes(
    failures,
    /^Frame (\d+) (?:dense-body|must contain 200-500 dense-body anchors|is missing an immutable dense-model)/,
  );
  if (denseFrames.size > 0) {
    summaries.push(countMessage(
      "Dense body tracking",
      denseFrames.size,
      frameCount,
      "The browser model did not provide a valid measured anchor set.",
    ));
  }
  for (const side of ["left", "right"] as const) {
    const handFrames = matchedFrameIndexes(
      failures,
      new RegExp(`^Frame (\\d+) ${side} hand (?:evidence is incomplete or ambiguous|requires 21 image and world landmarks)\\.$`),
    );
    if (handFrames.size > 0) {
      summaries.push(countMessage(
        `${side === "left" ? "Left" : "Right"} hand evidence`,
        handFrames.size,
        frameCount,
        "Those moments must be retained honestly as missing evidence.",
      ));
    }
  }

  failures.forEach((failure) => {
    if (/^Frame \d+ /.test(failure)) return;
    if (/^(?:denseBody|leftHand|rightHand|palmWrist) Deep Capture evidence is incomplete\.$/.test(failure)) {
      return;
    }
    if (consumed.has(failure)) return;
    consumed.add(failure);
    summaries.push(failure);
  });
  return summaries.slice(0, 8);
}
