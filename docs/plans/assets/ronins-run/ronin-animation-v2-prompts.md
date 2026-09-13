# Ronin animation v2: generation prompts

Generated with the built-in image tool on 2026-09-12. These are the recorded prompts in the selected asset lineage. Layout/alpha drafts are not runtime assets; only the final run and idle PNGs were copied to the game. Metadata selects six run poses per direction from the sixteen candidates.

See [asset production](asset-production.md) for file hashes, animation timing, anchors and known limits.

## Run poses: initial direction and gait exploration

Output: `exec-c872bfc5-67ba-42e5-9abc-6843d5a40c99.png`.

```text
Use case: stylized-concept. Asset type: production RUN animation sprite sheet for an existing illustrated isometric browser game. The reference is CHARACTER IDENTITY ONLY; its repeated same-leg poses are incorrect and must NOT be copied. Create a new sheet on a genuinely TRANSPARENT alpha background, no ground, no shadow, no grid lines, no labels. Exactly 16 full-body sprites in an evenly spaced grid of EIGHT columns and TWO rows, landscape 2048x1024. Equal 256x512 cells, generous gutters. Every character has identical proportions, straw conical hat, masked face, fitted navy ronin clothes, pale shin wraps, black boots, red flowing scarf, same painted detailed game-art finish. Camera fixed elevated three-quarter, 30-degree downward. ROW ONE: all eight poses face southeast / screen right and slightly toward viewer. ROW TWO: all eight face northeast / screen right and slightly away from viewer. Within each row, a TRUE SEQUENTIAL 8-FRAME RUN CYCLE, BOTH LEGS ALTERNATE and swing through very different silhouettes. Frames left to right: 1 LEFT foot reaches forward and makes ground contact, RIGHT leg stretched behind; 2 LEFT support knee compresses and pelvis drops while RIGHT heel recovers behind; 3 LEFT leg pushes backward under hips while RIGHT knee drives FORWARD and upward; 4 flight phase, RIGHT thigh clearly forward horizontal, RIGHT knee bent high, LEFT heel curled up behind, both feet airborne; 5 RIGHT foot reaches forward and makes ground contact, LEFT leg stretched behind; 6 RIGHT support knee compresses and pelvis drops while LEFT heel recovers behind; 7 RIGHT leg pushes backward under hips while LEFT knee drives FORWARD and upward; 8 flight phase, LEFT thigh clearly forward horizontal, LEFT knee bent high, RIGHT heel curled up behind, both feet airborne. Frames 5-8 MUST swap the legs and arm swing from frames 1-4, not duplicate them. Opposite arm swings naturally, torso leans 12 degrees into run, shoulder and hip twist, scarf follows behind with secondary movement. Maintain a COMMON anatomical scale for all 16 poses, not independently fitted silhouettes. Align pelvis horizontally over the same cell center x=128. Common imaginary ground baseline y=450 in each cell. Contact/compression feet touch that baseline; in airborne frames feet are above it. Hat normally at y=90; slight natural vertical variation for compression and flight. Keep scarf and feet inside each cell. No scenery, text, watermarks, circles, arrows, faux checkerboard or baked shadows. The priority is clearly alternating running legs, weight, compression, toe-off and flight, not sixteen nearly identical hero illustrations.
```

## Run poses: separated square layout

Output: `exec-d7f57b70-bb2f-4b00-9224-de448d99d1e4.png`.

```text
Re-layout these exact sixteen running poses into a SQUARE 4-column by 4-row animation sheet. Preserve genuine transparent background. Preserve the distinct leg and arm animation in every pose. NO redesign. Row1 = first four front-facing run frames. Row2 = last four front-facing run frames. Row3 = first four back-facing run frames. Row4 = last four back-facing run frames. Every sprite must fit completely within its own equal square cell with at least 12 percent empty margin on ALL FOUR SIDES. Make the characters smaller within their cells to ensure empty gutters. Absolutely NO overlap or touching between neighboring characters, including scarf and hat. Keep identical anatomical scale across all 16 sprites. All cells have common groundline at 85 percent cell height, common pelvis center at 55 percent cell width. Let the body rise and fall naturally within this common stage, do not align the bottom of airborne feet to the ground. Transparent PNG, square 2048 by 2048, exactly 4 columns and 4 rows, no text, no background, no checkerboard.
```

## Selected running sheet: true alpha extraction

Output: `exec-04e8f37e-bd44-4a8f-9dbf-f290a46a3ddf.png`.

```text
Use case: background-extraction. Edit target is the supplied 4x4 ronin sprite atlas. Remove the entire grey-and-white checkerboard background and make it genuinely TRANSPARENT with an alpha channel. The checkerboard is currently PAINTED INTO RGB PIXELS and is not transparency. Do not draw any checkerboard pattern in the output. Preserve all sixteen characters, their exact pixel placement, costume, red scarf, camera directions, poses, scale and detail. Change only background to true alpha=0, retain antialiased edges. Output the same square 4x4 sprite atlas as a transparent-background PNG. This is an actual game asset that must composite directly over a scene without any background rectangles.
```

## Standing poses: generation

Output: `exec-3a11b601-83f7-459a-8bf8-477c2a4caf58.png`.

```text
Use case: stylized-concept. Asset type: two standing IDLE sprites for the same illustrated isometric ronin game. Same compact masked navy ronin, straw hat, pale shin wraps, black boots and flowing red scarf as the reference. Exactly TWO full-body characters side by side, separated by large empty gutters, at identical scale. LEFT character faces screen right and slightly toward viewer (southeast). RIGHT character faces screen right and slightly away from viewer (northeast). Same fixed elevated 30-degree isometric camera as reference. BOTH FEET PLANTED on the same imaginary ground, feet shoulder-width apart, soft knees, relaxed ready posture, arms lowered naturally, torso mostly upright, red scarf resting behind in gentle folds. Do NOT show a running pose or a raised knee. Original painted detailed game-sprite style, clear silhouette. No actual floor, cast shadow, text, scenery or labels. Output a genuinely transparent PNG with alpha=0 between the two characters, opaque character interiors, clean cutout edges. No painted checkerboard. Equal square cells, generous margins on every side.
```

## Selected standing sheet: true alpha extraction

Output: `exec-8604e58f-16cc-42a4-96aa-d53dc0343bf6.png`.

```text
Use case: background-extraction. Edit target is the supplied two-character idle sprite atlas. Remove the entire grey-and-white checkerboard background and make it genuinely TRANSPARENT with an alpha channel. The checkerboard is currently PAINTED INTO RGB PIXELS and is not transparency. Do not draw any checkerboard pattern in the output. Preserve both characters, their exact pixel placement, costume, red scarf, camera directions, planted feet, scale and detail. Change only background to true alpha=0, retain antialiased edges. Output the same square two-sprite atlas as a transparent-background PNG. This is an actual game asset that must composite directly over a scene without any background rectangles.
```
