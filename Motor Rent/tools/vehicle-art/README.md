# Vehicle pictures for the fleet showcase

The website shows each model as a cut-out standing in front of its outlined name, and swaps the
picture when a rider picks a colour. These macOS tools make those pictures from one photo.
They run on-device (Apple Vision); nothing is uploaded.

1. **Cut out** the vehicle (transparent background):
   `swift lift.swift photo.jpg cut.png`
2. **Hide the number plate** (box in pixels: left top right bottom):
   `swift blankplate.swift cut.png clean.png 1355 447 1450 513`
3. **Make colour versions.** Mode: `car` for a silver/grey car, `grey` for a grey scooter,
   `red` for a red one. Body-panel masks (wheels, windows, plate) are set per photo in
   `recolour.swift`; check every result and adjust them for a new photo.
   `swiftc -O recolour.swift -o recolour && ./recolour clean.png red.png car "#C8102E" red`
   Colour hexes come from `packages/shared/src/colours.ts`.
4. **Save as WebP** (`cwebp -q 80 -alpha_q 90 -resize 1200 0 in.png -o out.webp`) to
   `apps/rider/assets/images/stock/` (`colours/<model>-<colour>.webp` for variants) and add the
   model to `ModelCutouts` in `apps/rider/src/components/photo.tsx` (make, model, base colour, variants).

Every vehicle of that make and model then uses the picture, and the vehicle's colour (set in
the admin) picks the matching version. Credit third-party photos in `stock/CREDITS.md`.

Vehicles without their own picture still get the outlined name, with their uploaded photo
framed in front of it.
