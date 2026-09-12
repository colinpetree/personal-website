import os
import uuid
import base64
import io
from flask import current_app

IMAGE_OPTIMIZE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}

# Long-edge cap for the "full-size" image optimize_image() produces. Nothing
# on the site ever displays a content image wider than ~1200 CSS px (the
# gallery's own max width) — 2400 covers that at 2x device-pixel-ratio with
# headroom to spare. Without this cap, a modern phone/scanner image (e.g. a
# 48-50MP source, ~5800x8700px — not unusual, and confirmed in this repo's
# own uploads/ directory) was being WebP-encoded at FULL original resolution:
# ~5.3s of pure CPU time for that one encode alone (measured directly against
# a real uploaded file), vs. ~0.4s once capped to 2400px — a >10x difference,
# and the dominant cost of the whole optimize_image() call (decode + all
# three responsive-variant resizes/encodes + the LQIP combined took well
# under 1s). That's what made multi-image gallery uploads feel broken even
# after parallelizing them client-side: N of these ~5s CPU-bound encodes
# competing for the same handful of cores. Capping also shrinks that file
# from ~4.4MB to ~130KB, which matters for public page weight too, since this
# "full-size" file is the fallback entry browsers may fetch outside the
# capped responsive variants.
MAX_IMAGE_DIM = 2400


def get_app_data_dir():
    """Persistent runtime data directory — defaults to the Flask app's own
    root (today's behavior, for local dev) but is overridable via
    APP_DATA_DIR so a versioned release/PyInstaller bundle can point uploads,
    certbot_domain.txt, etc. at a stable location that survives upgrades."""
    return os.getenv('APP_DATA_DIR', current_app.root_path)


def get_uploads_dir():
    return os.path.join(get_app_data_dir(), 'uploads')


def thumbnail_variant_filename(filename, uploads_dir, width=400):
    """Given a base uploaded image filename, returns its pre-generated
    {width}w WebP variant filename if present on disk, else the original
    filename unchanged (already-a-variant input, non-webp, or an image
    uploaded before variant generation existed)."""
    if not filename or not filename.endswith('.webp'):
        return filename
    if any(filename.endswith(f'_{w}w.webp') for w in (400, 800, 1200)):
        return filename
    base = filename[:-len('.webp')]
    variant = f'{base}_{width}w.webp'
    if os.path.exists(os.path.join(uploads_dir, variant)):
        return variant
    return filename


def optimize_image(input_path, uploads_dir, base_name):
    """Convert image to WebP, generate 400/800/1200w variants, and a base64 LQIP.

    Returns (webp_filename, srcset_string, lqip_data_url, width, height).
    """
    from PIL import Image

    img = Image.open(input_path)

    # For an oversized JPEG source (the common case — phone/camera photos),
    # ask libjpeg to decode at a reduced scale up front via its own fast DCT
    # scaling, instead of fully decoding at native resolution only to
    # immediately throw most of that detail away in the resize below. Must
    # be called before anything else touches pixel data. draft() only
    # supports power-of-2 scale factors and treats its target as a minimum,
    # so this is a coarse pre-scale — the resize below still does the exact,
    # high-quality LANCZOS scale down to MAX_IMAGE_DIM.
    if img.format == 'JPEG':
        img.draft('RGB', (MAX_IMAGE_DIM, MAX_IMAGE_DIM))

    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        img = img.convert('RGBA')
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    # Cap the source to MAX_IMAGE_DIM before any encoding — see the comment
    # on MAX_IMAGE_DIM for why this matters. Every downstream step (full-size
    # save, responsive variants, LQIP) operates on this capped image.
    if max(img.width, img.height) > MAX_IMAGE_DIM:
        scale = MAX_IMAGE_DIM / max(img.width, img.height)
        capped_size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
        img = img.resize(capped_size, Image.LANCZOS)

    original_width = img.width

    # Full-size WebP
    webp_filename = f'{base_name}.webp'
    img.save(os.path.join(uploads_dir, webp_filename), 'WEBP', quality=82)

    # Responsive variants — skip a breakpoint that isn't actually smaller than
    # the (now-capped) source instead of re-encoding an identical duplicate
    # file under a different name for no benefit.
    srcset_parts = []
    for w in (400, 800, 1200):
        if original_width <= w:
            continue
        h = max(1, round(img.height * w / original_width))
        variant = img.resize((w, h), Image.LANCZOS)
        vname = f'{base_name}_{w}w.webp'
        variant.save(os.path.join(uploads_dir, vname), 'WEBP', quality=82)
        srcset_parts.append(f'/api/uploads/{vname} {w}w')
    srcset_parts.append(f'/api/uploads/{webp_filename} {original_width}w')
    srcset = ', '.join(srcset_parts)

    # LQIP: 32px wide blurred placeholder as base64 JPEG (JPEG has no alpha,
    # so flatten transparency to white for this thumbnail only)
    lqip_h = max(1, round(img.height * 32 / original_width))
    lqip_img = img.resize((32, lqip_h), Image.LANCZOS)
    if lqip_img.mode == 'RGBA':
        bg = Image.new('RGB', lqip_img.size, (255, 255, 255))
        bg.paste(lqip_img, mask=lqip_img.split()[3])
        lqip_img = bg
    buf = io.BytesIO()
    lqip_img.save(buf, 'JPEG', quality=20)
    lqip = f'data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode()}'

    return webp_filename, srcset, lqip, img.width, img.height


def save_and_optimize_image(file, uploads_dir):
    """Saves an uploaded werkzeug FileStorage image, optimizing it to WebP.

    Returns (filename, srcset, lqip, width, height). Raises on
    unsupported/corrupt images — caller is responsible for catching and
    returning an error response.
    """
    os.makedirs(uploads_dir, exist_ok=True)
    base_name = uuid.uuid4().hex
    ext = file.filename.rsplit('.', 1)[-1].lower()
    tmp_path = os.path.join(uploads_dir, f'{base_name}_tmp.{ext}')
    file.save(tmp_path)
    try:
        return optimize_image(tmp_path, uploads_dir, base_name)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


AVATAR_MAX_DIM = 512


def save_and_optimize_avatar(file, uploads_dir):
    """Saves an uploaded avatar image as a single WebP, downscaled to fit
    within AVATAR_MAX_DIM on its longest side. Avatars only ever render small
    (nav bar, comment threads, admin lists), so unlike optimize_image() this
    skips the srcset variants and LQIP a full-size blog image needs.

    Returns the WebP filename. Raises on unsupported/corrupt images — caller
    is responsible for catching and returning an error response.
    """
    from PIL import Image

    os.makedirs(uploads_dir, exist_ok=True)
    base_name = uuid.uuid4().hex
    ext = file.filename.rsplit('.', 1)[-1].lower()
    tmp_path = os.path.join(uploads_dir, f'{base_name}_tmp.{ext}')
    file.save(tmp_path)
    try:
        img = Image.open(tmp_path)
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            img = img.convert('RGBA')
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        if max(img.width, img.height) > AVATAR_MAX_DIM:
            scale = AVATAR_MAX_DIM / max(img.width, img.height)
            new_size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
            img = img.resize(new_size, Image.LANCZOS)

        webp_filename = f'{base_name}.webp'
        img.save(os.path.join(uploads_dir, webp_filename), 'WEBP', quality=82)

        return webp_filename
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def save_favicon(file, uploads_dir):
    """Saves an uploaded favicon image as a WebP (for the <link rel="icon">
    tag, which browsers prefer when present) and also overwrites a
    fixed-name favicon.ico alongside it — served at the domain root for
    browsers, crawlers, and tools that request /favicon.ico directly without
    ever parsing the page's <link> tags.

    Returns the WebP filename. Raises on unsupported/corrupt images — caller
    is responsible for catching and returning an error response.
    """
    from PIL import Image

    os.makedirs(uploads_dir, exist_ok=True)
    base_name = uuid.uuid4().hex
    ext = file.filename.rsplit('.', 1)[-1].lower()
    tmp_path = os.path.join(uploads_dir, f'{base_name}_tmp.{ext}')
    file.save(tmp_path)
    try:
        img = Image.open(tmp_path)
        if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
            img = img.convert('RGBA')
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        webp_filename = f'{base_name}.webp'
        img.save(os.path.join(uploads_dir, webp_filename), 'WEBP', quality=82)

        # Standard multi-resolution ICO — browsers/OSes pick whichever size
        # fits (tab icon, bookmark, taskbar, ...). Capped to the source
        # image's own size so a smaller-than-60px upload doesn't upscale.
        max_dim = min(img.width, img.height)
        ico_sizes = [(s, s) for s in (16, 32, 48, 64) if s <= max_dim] or [(max_dim, max_dim)]
        img.save(os.path.join(uploads_dir, 'favicon.ico'), format='ICO', sizes=ico_sizes)

        return webp_filename
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
