# Distant forest atlas — 2026-09-13

Production asset: `public/games/ronins-run-3d/distant-tree-atlas-v1.png`.
Generated with the built-in image-generation tool; original output remains in
the local Codex generated-images folder. No external photograph was downloaded.
The delivered image is 1254 × 1254 RGBA, with four tree variants. The requested
2048 × 2048 size was not returned; the renderer uses the delivered resolution.
SHA-256: `53ff6a0ddcd84c128a1df9761545509271deb8c84e78cb57c2fa5ca5ffd93eec`.

The renderer selects atlas quadrants with UV coordinates on three crossed
planes per tree. All trees sit beyond the playable ground. One shared texture
and alpha-tested material preserve fine branch gaps without per-frame sorting,
extra lights or dynamic tree shadows. This replaces the crude conical distant
trees; nearby trees retain their full three-dimensional trunks and crowns.

## Generation prompt

Use case: photorealistic-natural. Asset type: production vegetation cutout atlas
for a realistic Japanese night village game. Create a square image with a
genuinely transparent RGBA background, exactly 2x2 equally sized cells meeting at
the center, no gutters or dividers. In each cell show ONE entire mature tree,
front elevation, full crown AND bare trunk down to its base, generous transparent
margin so no needles or branches touch any cell edge. Top left: tall irregular
Japanese cedar (Cryptomeria) with fine drooping sprays and visible branch gaps.
Top right: Japanese hinoki cypress, narrow irregular crown and delicate leafy
branch sprays. Bottom left: mature Japanese black pine with asymmetrical layered
clouds of needles and exposed twisting branches. Bottom right: broad Japanese
cedar with a slightly bent trunk and natural airy foliage. Natural forest
photography with extremely fine leaf and twig detail, soft overcast flat diffuse
light, muted dark green foliage, brown-grey bark. Entire trees upright,
roots/base near the lower edge of their own quadrant, tops near upper edge.
No ground, no grass, no sky, no fog, no cast shadow, no other objects, no text,
no watermark. These images will be placed on distant 3D tree cards; preserve
true transparency between branches and around each tree. No painted silhouettes,
no geometric conical shapes, no stylisation. Request 2048x2048.
