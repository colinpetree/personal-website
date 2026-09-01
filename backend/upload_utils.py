import os
import uuid
import base64
import io
from flask import current_app

IMAGE_OPTIMIZE_EXTENSIONS = {'png', 'jpg', 'jpeg', 'webp'}


def get_app_data_dir():
    """Persistent runtime data directory — defaults to the Flask app's own
    root (today's behavior, for local dev) but is overridable via
    APP_DATA_DIR so a versioned release/PyInstaller bundle can point uploads,
    certbot_domain.txt, etc. at a stable location that survives upgrades."""
    return os.getenv('APP_DATA_DIR', current_app.root_path)


def get_uploads_dir():
    return os.path.join(get_app_data_dir(), 'uploads')


def optimize_image(input_path, uploads_dir, base_name):
    """Convert image to WebP, generate 400/800/1200w variants, and a base64 LQIP.

    Returns (webp_filename, srcset_string, lqip_data_url).
    """
    from PIL import Image

    img = Image.open(input_path)
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        img = img.convert('RGBA')
    elif img.mode != 'RGB':
        img = img.convert('RGB')

    original_width = img.width

    # Full-size WebP
    webp_filename = f'{base_name}.webp'
    img.save(os.path.join(uploads_dir, webp_filename), 'WEBP', quality=82)

    # Responsive variants
    srcset_parts = []
    for w in (400, 800, 1200):
        if original_width > w:
            h = max(1, round(img.height * w / original_width))
            variant = img.resize((w, h), Image.LANCZOS)
        else:
            variant = img
        vname = f'{base_name}_{w}w.webp'
        variant.save(os.path.join(uploads_dir, vname), 'WEBP', quality=82)
        srcset_parts.append(f'/api/uploads/{vname} {w}w')
    srcset_parts.append(f'/api/uploads/{webp_filename}')
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

    return webp_filename, srcset, lqip


def save_and_optimize_image(file, uploads_dir):
    """Saves an uploaded werkzeug FileStorage image, optimizing it to WebP.

    Returns (filename, srcset, lqip). Raises on unsupported/corrupt images —
    caller is responsible for catching and returning an error response.
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
