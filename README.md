# Rybu

A multi-column [Ghost](https://github.com/TryGhost/Ghost) theme with a unique card layout. Make your publication more organized with cards and widgets.

**Demo: https://ruby.ghost.io**

# Instructions

1. [Download this theme](https://github.com/TryGhost/Ruby/archive/main.zip)
2. Log into Ghost, and go to the `Design` settings area to upload the zip file

# Travel route maps

Rybu adds a lightweight embeddable map component for travel routes and points of interest. Drop a `<div class="rybu-map">` inside a **Ghost HTML card** and the theme hydrates it into an interactive map on load.

Two providers are supported, picked automatically:

- **Apple Maps**, through MapKit JS 6, when a Maps token is configured (Ghost Admin → Design → *Mapkit token*). Requires an Apple Developer Program membership ($99/year).
- **Leaflet + CARTO/OSM tiles** when no token is set. Free, no API key, with light/dark basemap auto-switched via `prefers-color-scheme`.

Strokes and markers use a monochrome ink palette: black on light backgrounds, white on dark.

Readers can't zoom: there is no zoom control, and wheel, trackpad, double-click
and pinch zoom are all off, so scrolling through a post is never captured by a
map. Framing stays what the post asks for, auto-fitted over every point or set
explicitly with `data-zoom`. Panning still works.

## Quick start

Paste this in a Ghost HTML card:

```html
<div class="rybu-map"
     data-pois="Paris:48.8566,2.3522|Lyon:45.7640,4.8357|Marseille:43.2965,5.3698">
</div>
```

## Attributes

Each layer attribute takes a pipe-separated list of points, each `LABEL:lat,lng` (label optional):

| Attribute      | Role                                  | Rendering                                          |
| -------------- | ------------------------------------- | -------------------------------------------------- |
| `data-flights` | Air legs                              | Great-circle dashed arcs between successive points |
| `data-route`   | Overland itinerary                    | Straight polyline between successive points        |
| `data-pois`    | Points of interest                    | Markers only, no line                              |
| `data-width`   | `regular` (default) / `wide` / `full` | Uses Ghost's `.gh-canvas` grid columns             |
| `data-zoom`    | Optional span (0.5 street → 50 world) | Defaults to auto-fit over all points               |

Attributes are combinable. All points from all layers are fitted in view by default.

## Examples

### A round-trip flight with stops

```html
<div class="rybu-map"
     data-flights="CDG:49.0097,2.5479|HAN:21.2212,105.8072|SGN:10.8188,106.6520|HAN:21.2212,105.8072|CDG:49.0097,2.5479">
</div>
```

### Flights + overland routes + POIs combined

Mix layers freely. Here a HAN↔SGN round-trip, two day-trips from Hanoi, and four POIs:

```html
<div class="rybu-map" data-width="wide"
     data-flights="HAN:21.2212,105.8072|SGN:10.8188,106.6520|HAN:21.2212,105.8072"
     data-pois="Cat Ba:20.7267,107.0489|Ha Giang:22.8276,104.9784|Nho Que:23.1611,105.3527|Hải Phòng:20.8449,106.6881">
</div>
```

### Multiple independent route segments

`data-route` is a single polyline. For several disjoint routes on one map, use the JSON form with one `route` layer per segment:

```html
<div class="rybu-map" data-width="full">
  <script type="application/json">
  {
    "layers": [
      {"type":"route","points":[
        {"label":"Hanoi","lat":21.0285,"lng":105.8542},
        {"label":"Ha Giang","lat":22.8276,"lng":104.9784},
        {"label":"Nho Que River","lat":23.1611,"lng":105.3527}
      ]},
      {"type":"route","points":[
        {"label":"Hanoi","lat":21.0285,"lng":105.8542},
        {"label":"Hải Phòng","lat":20.8449,"lng":106.6881},
        {"label":"Cat Ba","lat":20.7267,"lng":107.0489}
      ]}
    ]
  }
  </script>
</div>
```

### Width variants

```html
<div class="rybu-map" data-pois="..."></div>                   <!-- regular -->
<div class="rybu-map" data-width="wide" data-pois="..."></div> <!-- wide    -->
<div class="rybu-map" data-width="full" data-pois="..."></div> <!-- full    -->
```

In `full` mode the map spans the viewport edge-to-edge (no border-radius, no shadow).

## Reusing from the editor

Ghost doesn't let themes add custom Koenig cards, but you can save any `<div class="rybu-map">…</div>` as a **snippet** (select the HTML card → *Save as snippet*) and insert it via `/<snippet-name>` in future posts.

## Enabling Apple Maps (optional)

Apple Maps needs a Maps token. You don't sign a JWT yourself: Apple generates the
token for you in the developer portal.

1. Go to [developer.apple.com/account](https://developer.apple.com/account), click
   **Services** in the sidebar, then **Configure** under the Maps section.
2. Click **Tokens** at the top of the usage dashboard, then **Tokens (+)**.
3. Set **Token Type** to `MapKit JS`.
4. Set **Restriction Type** to `Domain`, list your blog's domain(s) under
   **Websites**, and pick a **Domain Token Validation Duration**. `No Expiration`
   is the sane choice here, since the token lives in a theme setting nobody will
   remember to rotate.
5. Click **Create**, then copy the token.
6. Paste it in *Ghost Admin → Design → Customize → Mapkit token*.

The theme serves the token publicly in the page `<head>`, which is how MapKit JS is
designed to work. The domain restriction is what protects it, not secrecy. Revoke a
token at any time from the same screen.

Free tier, per Apple Developer Program membership: 250,000 map views and 25,000
service calls per day. Usage is visible at
[maps.developer.apple.com](https://maps.developer.apple.com/).

Without a token the theme falls back to Leaflet + CARTO tiles automatically.

### MapKit JS version

The theme loads MapKit JS 6 from its modular entry point:

```
https://cdn.apple-mapkit.com/mk/6/mapkit.core.js
```

with `data-libraries="full-map"`, so the browser downloads only the map, overlay and
annotation interfaces instead of the whole framework. The major version is pinned at
`6` and Apple serves the latest `minor.patch` behind that URL.

# Development

Styles are compiled using Gulp/PostCSS to polyfill future CSS spec. You'll need [Node](https://nodejs.org/), [Yarn](https://yarnpkg.com/) and [Gulp](https://gulpjs.com) installed globally. After that, from the theme's root directory:

```bash
# Install
yarn

# Run build & watch for changes
yarn dev
```

Now you can edit `/assets/css/` files, which will be compiled to `/assets/built/` automatically.

The `zip` Gulp task packages the theme files into `dist/rybu.zip`, which you can then upload to your site.

```bash
yarn zip
```

# Contribution

This repo is synced automatically with [TryGhost/Themes](https://github.com/TryGhost/Themes) monorepo. If you're looking to contribute or raise an issue, head over to the main repository [TryGhost/Themes](https://github.com/TryGhost/Themes) where our official themes are developed.

## Theme translations

Please see the @Tryghost/Themes/theme-translations/README.md for how to edit or contribute translations.

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
