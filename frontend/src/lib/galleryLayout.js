// Shared gallery row-grouping + justified-layout math, used by both the
// Lexical editor (GalleryNodeComponent render) and the public HTML export
// (GalleryNode.exportDOM) so the two stay in sync by construction.

export const GALLERY_MAX_IMAGES = 9

// Row sizes are fixed by total image count (not aspect-ratio balancing) —
// modeled on Ghost CMS's gallery card.
const ROW_SIZE_TABLE = {
  1: [1],
  2: [2],
  3: [3],
  4: [2, 2],
  5: [3, 2],
  6: [3, 3],
  7: [3, 2, 2],
  8: [3, 3, 2],
  9: [3, 3, 3],
}

export function groupImagesIntoRows(images) {
  const sizes = ROW_SIZE_TABLE[images.length]
  const rows = []
  if (sizes) {
    let i = 0
    for (const size of sizes) {
      rows.push(images.slice(i, i + size))
      i += size
    }
    return rows
  }
  // Defensive fallback for a count outside 1-9 (shouldn't normally happen —
  // GALLERY_MAX_IMAGES is enforced everywhere images are added — but must
  // never silently drop images if it does): chunk everything into rows of 3
  // instead of truncating to a single row.
  for (let i = 0; i < images.length; i += 3) {
    rows.push(images.slice(i, i + 3))
  }
  return rows
}

export function aspectRatioOf(img) {
  return img?.width && img?.height ? img.width / img.height : 1
}

// For a multi-image row: each image's flex-grow is its own aspect ratio, and
// the row's own aspect-ratio is the sum of them. At row width W, flexbox
// gives image i width W*ar_i/sum(ar); the row's own aspect-ratio:sum(ar)
// makes its rendered height H = W/sum(ar). So image i's rendered ratio is
// (W*ar_i/sum(ar)) / (W/sum(ar)) = ar_i — its true aspect ratio, exactly.
// object-fit:cover absorbs the sub-pixel error from `gap` eating into W.
export function computeRowAspectRatio(rowImages) {
  return rowImages.reduce((sum, img) => sum + aspectRatioOf(img), 0) || rowImages.length
}
