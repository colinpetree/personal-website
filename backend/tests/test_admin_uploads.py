"""Admin uploads (routes/admin_config.py) and how they are served back
(routes/uploads.py). Everything is written to the temporary APP_DATA_DIR
that conftest.py sets up."""
import io
import os

import pytest
from PIL import Image

from conftest import APP_DATA_DIR

UPLOADS = os.path.join(APP_DATA_DIR, 'uploads')


def _png(width=1200, height=800):
    buf = io.BytesIO()
    Image.new('RGB', (width, height), (200, 30, 30)).save(buf, 'PNG')
    buf.seek(0)
    return buf


def _upload(c, url, content, name, **form):
    return c.post(url, data={'file': (content, name), **form}, content_type='multipart/form-data')


def test_image_is_optimized_to_webp_with_variants(login_as):
    r = _upload(login_as('contributor'), '/api/admin/upload', _png(), 'photo.png')
    assert r.status_code == 200, r.get_json()
    data = r.get_json()
    assert data['filename'].endswith('.webp') and data['mime_type'] == 'image/webp'
    assert (data['width'], data['height']) == (1200, 800)
    assert data['srcset'] and data['lqip'].startswith('data:image')
    assert os.path.exists(os.path.join(UPLOADS, data['filename']))
    # Each srcset entry is a real file next to it.
    for entry in data['srcset'].split(','):
        name = entry.strip().split(' ')[0].rsplit('/', 1)[-1]
        assert os.path.exists(os.path.join(UPLOADS, name)), name


def test_big_images_are_scaled_down_but_headers_may_be_wider(login_as):
    c = login_as('editor')
    normal = _upload(c, '/api/admin/upload', _png(3000, 1000), 'wide.png').get_json()
    header = _upload(c, '/api/admin/upload', _png(3000, 1000), 'wide.png', context='header').get_json()
    assert normal['width'] < 3000
    assert header['width'] == 3000


@pytest.mark.parametrize('name', ['page.html', 'script.js', 'tool.exe', 'noextension', 'shell.php'])
def test_disallowed_types_refused(login_as, name):
    assert _upload(login_as('editor'), '/api/admin/upload', io.BytesIO(b'data'), name).status_code == 400


def test_missing_or_empty_file_refused(login_as):
    c = login_as('editor')
    assert c.post('/api/admin/upload', data={}, content_type='multipart/form-data').status_code == 400
    assert _upload(c, '/api/admin/upload', io.BytesIO(b''), '').status_code == 400


def test_corrupt_image_refused(login_as):
    assert _upload(login_as('editor'), '/api/admin/upload', io.BytesIO(b'not a png'), 'fake.png').status_code == 400


def test_uploaded_file_is_served_back(client, login_as):
    name = _upload(login_as('editor'), '/api/admin/upload', _png(), 'photo.png').get_json()['filename']
    r = client.get(f'/api/uploads/{name}')
    assert r.status_code == 200 and r.mimetype == 'image/webp'
    r.close()


def test_svg_is_served_as_a_download_not_a_page(client, login_as):
    """An SVG can hold script. Served inline from this site it would run with
    the site's cookies, so it must come back as an attachment."""
    svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
    r = _upload(login_as('contributor'), '/api/admin/upload', io.BytesIO(svg), 'drawing.svg')
    assert r.status_code == 200
    served = client.get(f"/api/uploads/{r.get_json()['filename']}")
    assert served.headers['Content-Disposition'].startswith('attachment')
    served.close()


def test_video_upload_with_poster(login_as, monkeypatch):
    import routes.admin_config

    def fake_poster(video_path, poster_path):
        with open(poster_path, 'wb') as f:
            f.write(b'jpg')
        return True

    monkeypatch.setattr(routes.admin_config, '_extract_video_poster', fake_poster)
    data = _upload(login_as('editor'), '/api/admin/upload', io.BytesIO(b'\x00' * 64), 'clip.mp4').get_json()
    assert data['filename'].endswith('.mp4')
    assert data['poster_filename'].endswith('_poster.jpg')


def test_video_upload_survives_a_failed_poster(login_as, monkeypatch):
    import routes.admin_config

    def broken(*_):
        raise RuntimeError('ffmpeg crashed')

    monkeypatch.setattr(routes.admin_config, '_extract_video_poster', broken)
    r = _upload(login_as('editor'), '/api/admin/upload', io.BytesIO(b'\x00' * 64), 'clip.webm')
    assert r.status_code == 200 and r.get_json()['poster_filename'] is None


def test_favicon(login_as):
    c = login_as('editor')
    r = _upload(c, '/api/admin/upload-favicon', _png(64, 64), 'icon.png')
    assert r.status_code == 200, r.get_json()
    assert os.path.exists(os.path.join(UPLOADS, r.get_json()['filename']))
    assert _upload(c, '/api/admin/upload-favicon', io.BytesIO(b'<svg/>'), 'icon.svg').status_code == 400
    assert _upload(c, '/api/admin/upload-favicon', io.BytesIO(b'junk'), 'icon.png').status_code == 400


def _leftover_temp_files():
    return [f for f in os.listdir(UPLOADS) if '_tmp.' in f] if os.path.isdir(UPLOADS) else []


def test_recording_is_transcoded_to_mp3(login_as, monkeypatch):
    import routes.admin_config

    def fake_transcode(src, dest):
        with open(dest, 'wb') as f:
            f.write(b'mp3')

    monkeypatch.setattr(routes.admin_config, '_transcode_to_mp3', fake_transcode)
    r = _upload(login_as('editor'), '/api/admin/upload-recording', io.BytesIO(b'webm'), 'blob.webm')
    assert r.status_code == 200
    assert r.get_json()['filename'].endswith('.mp3')
    assert _leftover_temp_files() == []


@pytest.mark.parametrize('error,code', [(FileNotFoundError('ffmpeg not found'), 'ffmpeg_not_found'), (RuntimeError('bad input'), 'transcode_failed')])
def test_failed_recording_cleans_up(login_as, monkeypatch, error, code):
    import routes.admin_config

    def failing(src, dest):
        raise error

    monkeypatch.setattr(routes.admin_config, '_transcode_to_mp3', failing)
    r = _upload(login_as('editor'), '/api/admin/upload-recording', io.BytesIO(b'webm'), 'blob.webm')
    assert r.status_code == 500 and r.get_json()['error'] == code
    assert _leftover_temp_files() == []


def test_recording_needs_a_file(login_as):
    assert login_as('editor').post('/api/admin/upload-recording', data={}, content_type='multipart/form-data').status_code == 400
