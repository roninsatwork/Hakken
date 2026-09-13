# Character and foliage surfaces — 2026-09-12

Generated with the built-in image-generation tool. Original outputs are copied
unchanged into the project; the foliage image retains its actual alpha channel.
No third-party model or texture packs were added.
Both delivered images are 1254 × 1254 pixels; the character prompt requested
2048 × 2048, but the actual tool output is the smaller size recorded here.

- [Leather, indigo cotton, brass and red cotton atlas](../../../../public/games/ronins-run-3d/character-material-atlas-v1.png)
- [Maple, bamboo and fern atlas](../../../../public/games/ronins-run-3d/foliage-atlas-v1.png)

The renderer decodes four equal cells from each image before allowing play.
Character textures use the existing shared materials; patrol vulnerability still
changes isolated uniforms, with the same shader configuration. Alpha-tested
foliage uses curved mesh cards and spatial batches, without per-leaf transparency
sorting. The cloth and leather height variation is millimetre/submillimetre scale.

The companion models are authored mesh cross sections and articulated groups in
`TailoredGeometry.ts` and `CharacterAssets.ts`: an open coat hem, shaped torso,
continuous palm, curved fingers, folded sleeves and a shaped brass muzzle.
These improve the playable assets but do not turn the reference into a rendered
game screenshot. Final visual acceptance against the concept remains explicit.

## Character atlas prompt

Use case: photorealistic-natural. Asset type: production base-color MATERIAL TEXTURE ATLAS for a first-person Japanese night heist game. One square 2048x2048 image consisting of exactly 2x2 equally sized square quadrants meeting at center, NO gutters, NO borders, NO text. Perfect orthographic close-up surface scans, neutral diffuse illumination, no objects, no perspective, no cast shadows, no highlights baked in. Each quarter individually seamless tileable. TOP LEFT: dark charcoal worn glove leather, extremely fine natural pores, subtle shallow fine wrinkles, worn grey edges of grain, no stitching, no objects, charcoal grey not solid black. TOP RIGHT: faded indigo woven heavy cotton, visible fine twill fibers, tiny irregularities and mild rain-darkened mottling, almost flat surface without large folds. BOTTOM LEFT: weathered antique brass plate surface, mottled warm bronze gold, very fine hairline scratches and subdued oxidised dark patches, subtle patina, no bolts or panel edges. BOTTOM RIGHT: faded deep vermilion red woven cotton, fine cotton fibers, slight irregular dye weathering, no folds or ribbons. Rich realistic microdetails to dress real 3D models. Do not draw a character, clothes, glove or scene. Texture swatches only.

## Foliage atlas prompt

Use case: photorealistic-natural. Asset type: game foliage texture atlas with a genuinely TRANSPARENT background and preserved alpha channel. One square image arranged as exactly four equal square quadrants with a single isolated botanical leaf in the middle of EACH quadrant; leave generous transparent margins around every leaf, nothing overlaps centerlines. Each leaf photographed straight-on, flat and fully visible, stem pointing downward, tip upward, natural fine veins and serration, softly diffuse neutral illumination, no drop shadows, no text, no frames. Top left: one deep crimson seven-lobed Japanese maple leaf. Top right: one autumn rust-red seven-lobed Japanese maple leaf with subtle brown edges. Bottom left: one narrow long dark-green bamboo leaf. Bottom right: one lush green fern frond with paired delicate leaflets, narrow vertically oriented. Photorealistic botanical details, small imperfections and natural variations, no plastic. Each individual leaf or frond centered within its own exact quarter; this is a production cutout texture asset for actual 3D vegetation.
