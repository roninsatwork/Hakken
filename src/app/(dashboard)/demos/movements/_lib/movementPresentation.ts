const LEGACY_CAPTURE_TITLE_PATTERN = /^(body\s+capture(?:\s+3d)?|untitled(?:\s+routine)?|unknown)$/i;

export function getStudioRoutineTitle(title: string | null | undefined) {
  const trimmedTitle = title?.trim();

  if (!trimmedTitle || LEGACY_CAPTURE_TITLE_PATTERN.test(trimmedTitle)) {
    return "Tall Spine Flow";
  }

  return trimmedTitle;
}
