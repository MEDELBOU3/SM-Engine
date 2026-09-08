# SM Engine Website - Image-Led Creative Control Room

## 🎯 Design Transformation Summary

The **SM Engine Intro Website** (`SM-Engine-intro-website`) now uses an image-led creative control-room direction: real editor captures lead the story, while motion and interface states explain how the product feels to use.

The update removes decorative CSS glyphs and replaces them with purposeful screenshots from the real editor. The visual language combines deep blue-black surfaces, a light studio theme, signal-cyan actions, readable tabs, and restrained GSAP motion.

---

## 🎨 Color Palette & Architecture

### Two-theme studio palette
- **Dark canvas**: `#070b10` with blue-black surfaces
- **Light canvas**: `#f1f4f5` with white studio panels
- **Signal accent**: cyan for focus, active states and calls to action
- **Warm accent**: restrained amber for live status and product details
- **Typography**: DM Sans for narrative copy and JetBrains Mono for product metadata

### Geometry & interaction
- **Framing**: generous editorial spacing with real product screenshots as the visual anchor
- **Cards**: restrained 8–14px corners so images feel like product panels, not decorative tiles
- **Interaction**: persistent theme, visible active tabs, image zoom, keyboard tab navigation, pointer tilt and magnetic primary actions

---

## 🎬 GSAP Animation System (`script.js`)

1. **Image-led hero**: the real SM Engine interface is the first proof point.
2. **Attention section**: three real screenshots explain context, feedback and flow.
3. **Interactive workspace tabs**: tabs remain visible after switching and support arrow/Home/End keys.
4. **Purposeful Showcase**: a five-step gallery path — Shape, Connect, Build worlds, Direct motion, Finish.
5. **Theme persistence**: the public pages and documentation share the light/dark preference.

---

## 📁 Updated Files (outside `docs/`)

- ✅ `index.html` - Minimalist luxury homepage with workspace tabs, clean video demo, and direct download CTAs.
- ✅ `features.html` - In-depth feature breakdowns for 3D modeling, node shaders, atmospheric optics, ocean waves, timeline animation, and video/audio editing.
- ✅ `workspaces.html` - Interface regions (Viewport, Outliner, Inspector) and 6 dedicated workspaces.
- ✅ `showcase.html` - Filterable screenshot gallery with full zoom lightbox.
- ✅ `roadmap.html` - Milestone phases (v1.0.0 Stable, WebGPU compute, Multiplayer, Ecosystem).
- ✅ `download.html` - Download center with system requirements table and Vimeo demonstrations.
- ✅ `styles.css` - Luxury dark stylesheet with sharp geometry and clean typography.
- ✅ `script.js` - Refined GSAP 3 & ScrollTrigger interaction script.
