# Marque

A local tool that turns your finished logo, colours and fonts into brand guidelines, a Brand Assets mockup deck, a client presentation, print-ready stationery and a complete logo package. Runs in your browser on your own machine; nothing is uploaded anywhere.

## Run it

You need Node.js 20 or newer (`node -v` to check, or install from nodejs.org).

```bash
cd ~/playground/marque
npm install      # first time only
npm run dev      # opens http://localhost:5173
```

## Workflow

1. **Export your logos as SVG** from Illustrator, Figma or Affinity. Outline all type first. Use knockouts (compound paths) rather than white shapes, so the black and white versions work.
   - Illustrator: File › Export › Export As › SVG, Styling: Presentation Attributes or Internal CSS, Font: Convert to Outlines.
2. **Fill in the sidebar.** Everything is optional; pages without content are skipped.
   - *Brand*: name, tagline, about, vision, mission, year, website, a note on collaboration.
   - *Story and architecture*: name meaning and pronunciation, ethos points, sub-brands with their own logos, and the design approach behind the mark.
   - *Logos*, *Colours* (with meaning, associations and usage %), *Typography* (with usage and language support), *Logo rules*.
   - *Brand elements and imagery*: pattern style, SVG shapes, photos for the imagery page.
   - *Contact and stationery*: the person on the business card, ID card and email signature, and your card size.
   - *Brand assets deck*: which mockups to include, and your photo mockup library.
   - *Layout and pages*: Swiss, Bold or Noir template, 16:9 or A4, and a checkbox for every page.
3. **Tabs**
   - **Guidelines**: the full brand guideline document (up to ~45 pages).
   - **Brand Assets**: cover, logo, design approach, then a slide per mockup (business cards, letterhead and envelope, folder, ID card and lanyard, polo, cap and mug, flask and notebook, tote and shopping bag, phone, signage, email signature) and your photo mockups.
   - **Presentation**: the concept deck for the client pitch.
   - **Print files**: business card front and back, A4 letterhead and DL envelope at true size with 3 mm bleed and optional crop marks.
4. **Export PDF** opens the print dialog. Choose *Save as PDF* and keep *Background graphics* on. Page sizes are set for you, including a different size per sheet on the Print files tab (use Chrome).
5. **Download logo package** builds a zip with:
   - every logo in full colour, black, white and one-colour versions, split into:
     - **Digital (RGB)**: SVG, PNG at 500, 1000 and 2000 px, and JPG
     - **Print (CMYK)**: vector PDF and EPS using your swatch-book CMYK values (black is pure K)
     - **Print (Pantone)**: vector PDF and EPS with each brand colour as a named spot ink, for colours that have a Pantone reference
   - favicons (16, 32, 48 and .ico), an Apple touch icon, PWA icons and a social avatar
   - Adobe Swatch Exchange palettes: RGB, and a print one with CMYK values and Pantone spot swatches
   - CSS variables, design tokens JSON and Tailwind colours
   - pattern tiles (SVG) and pattern backgrounds (PNG)
   - social templates: Instagram post and story, LinkedIn banner, X header, Facebook cover
   - an email signature (HTML) with its logo
   - a client-friendly *Read me* file

### Print files

The CMYK and Pantone files are written by Marque itself, not by the browser, so the inks are exactly what you entered under *Colours*. Enter CMYK as `C85 M70 Y0 K0` or `85 70 0 0`, and Pantone as `2728 C`. Colours without CMYK values use an estimate, and the *Print readiness* section in the sidebar lists them before you export.

Outline live text and expand gradients, clipping masks and `<use>` symbols before uploading. Artwork with any of these still exports, but its print file is an RGB PDF, and the read-me says why. Artwork with transparency gets print PDFs but no EPS, because EPS can't hold transparency.

## Editing pages like an artboard

Click **Edit layout** above any document (Guidelines, Brand Assets or Presentation). Each page gets a bar with:

- **Text, Image, Shape, Logo**: add a free layer on top of the page. Drag to move and drag the handles to resize. Layers snap to the page centre and edges and to each other; hold Alt to turn snapping off. Double-click text to type, or double-click an image to replace it.
- **Add slide after**: insert your own slide. *Mockup with details* asks for a PNG or JPG (e.g. a mockup you made in Photoshop) and lays it out with an editable title, description and specs. There are also *Full-bleed image with caption*, *Two images* and *Blank artboard* templates.
- **Hide slide**: leave a generated page out of the PDF. On your own slides the bar has the background colour, move up and down, and delete.

You can drop image files from Finder straight onto a page, or paste an image with ⌘V onto the selected page. The panel on the right edits the selected layer: position, size, font, size, weight, colour, alignment, image fit, corner radius, and front or back. Keys: Delete, arrows to nudge (Shift for bigger steps), ⌘D to duplicate, `]` and `[` to change the order, ⌘Z to undo and Esc to deselect.

Layers and custom slides are saved with the project (and in *Save file*), and they export with the PDF. Generated content updates from the sidebar as before. To change a generated slide completely, hide it and add your own slide in its place.

**Moving around the canvas** works like Figma. The sidebar stays put while the pages scroll. Hold Space and drag, or drag with the middle mouse button, to pan. Use ⌘ + scroll or a trackpad pinch to zoom on the pointer, and ⌘0, ⌘+ and ⌘− for 100%, zoom in and zoom out. Click the percentage next to the zoom slider to jump back to 100%.

## Photo mockups

Use your own mockup photos (from Freepik, Envato, your own shoots) instead of opening Photoshop for every client:

1. In *Brand assets deck*, click **Add photo mockup** and choose a blank mockup photo.
2. Drag the four corner handles onto a surface (top left first, then clockwise). Pick what goes there: a logo, the business card front or back, letterhead, envelope, pattern, tagline or a social post.
3. Add more surfaces for photos with several items (a card front and back, a letterhead and envelope).
4. Choose a blend: *Multiply* for print on white paper or fabric, *Screen* for light ink on dark surfaces.

Mockups are saved to a library shared by all projects, so each photo is set up once and then every new brand drops straight in. **Export library** backs it up or moves it to another Mac. Project files (*Save file*) include the photos and mockups they use.

Projects save automatically in the browser. Photos are stored in the browser's database (IndexedDB), the rest in local storage.

## Code map

- `src/types.ts`: the brand data model
- `src/Editor.tsx`: the sidebar
- `src/pages/Guidelines.tsx`, `src/pages/Assets.tsx`, `src/pages/Deck.tsx`, `src/pages/Print.tsx`: documents
- `src/pages/Merch.tsx`, `src/pages/Mockups.tsx`, `src/pages/Stationery.tsx`: mockups and stationery artwork
- `src/pages/PhotoScene.tsx`, `src/MockupEditor.tsx`, `src/lib/homography.ts`: photo mockups
- `src/lib/images.ts`, `src/lib/library.ts`: photo storage and the shared mockup library
- `src/lib/extras.ts`: patterns, social templates and email signature
- `src/styles/doc.css`: document styling (all templates)
- `src/lib/svg.ts`, `src/lib/pathdata.ts`: SVG cleanup, recolouring, rasterising, construction analysis
- `src/lib/color.ts`: contrast, CMYK estimate, OKLCH ramps
- `src/lib/export.ts`: logo package, ASE, ICO and tokens
- `src/edit/`: artboard editing (layers, custom slides, inspector)
- `src/lib/vector.ts`: CMYK and Pantone PDF and EPS writers, print readiness checks
