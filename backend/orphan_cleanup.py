"""Finds and deletes files in the uploads directory no longer referenced by
anything in the database, on a two-phase mark-and-sweep with a grace period —
see deploy/BACKUP.md for the full design writeup. Deleting a post/project, or
editing one to remove an image, never deletes the underlying uploaded file
(confirmed: neither admin_blog.py's delete_post/update_post nor
admin_projects.py's delete_project touch backend/uploads at all), so this is
the only thing that ever reclaims that space.

A file is never deleted the first run it looks unreferenced — it's recorded
as a "candidate" with a timestamp, and only actually removed once it's been
continuously unreferenced across ORPHAN_MEDIA_GRACE_DAYS worth of runs. If it
becomes referenced again before then (a recreated post, a restored image),
its candidacy is cancelled immediately. A circuit breaker refuses to touch
anything at all if a single run would flag-or-delete more than
ORPHAN_MEDIA_MAX_PER_RUN files, since that's a much more likely sign of a bug
in the reference-scanning logic than of a genuine bulk cleanup."""
import html.parser
import json
import logging
import os
import time

logger = logging.getLogger(__name__)

DEFAULT_GRACE_DAYS = 7
DEFAULT_MAX_PER_RUN = 20

STATE_FILENAME = 'orphan-media-state.json'

# Every attribute, on any tag, that the Lexical editor's node set (nodes.jsx)
# is known to use for an uploaded-file reference: img[src|srcset],
# video[src|poster], audio[src], a[href] (file/audio download links),
# figure[data-srcset|data-thumbnail-src], div[data-src] (file attachments),
# header[data-header-image|data-header-video]. Deliberately keyed by
# attribute name alone, not (tag, attribute) pairs — a future node type that
# reuses one of these same attribute names is covered automatically without
# this file needing an update. data-lqip/data-header-image-lqip are
# INTENTIONALLY excluded — those hold base64 data: URIs, never a file.
_REFERENCE_ATTRS = {
    'src', 'srcset', 'poster', 'href',
    'data-src', 'data-srcset', 'data-thumbnail-src',
    'data-header-image', 'data-header-video',
}

# All Lexical-editor-driven rich-text fields on SiteConfig — confirmed these
# render through the identical node set as BlogPost.content_html, so header
# videos/galleries/etc. can appear in page content too, not just posts.
_SITECONFIG_TEXT_FIELDS = (
    'home_text', 'blog_text', 'projects_text', 'about_text',
    'contact_text', 'ai_demo_text', 'payment_text',
)


def _normalize_reference(value):
    """Returns the bare filename a raw attribute value refers to, or None if
    it doesn't plausibly reference a local upload (a data: URI, an external
    absolute URL, or anything with a '/' left over after stripping the
    known upload prefix)."""
    value = value.strip()
    if not value or value.startswith('data:'):
        return None
    # a[href] download links append "?name=..." — strip any query string
    # defensively on every attribute, not just href.
    value = value.split('?', 1)[0]
    if value.startswith('/api/uploads/'):
        value = value[len('/api/uploads/'):]
    if not value or '/' in value or value.startswith('http://') or value.startswith('https://'):
        return None
    return value


class _ReferenceExtractor(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.found = set()

    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name not in _REFERENCE_ATTRS or not value:
                continue
            if name in ('srcset', 'data-srcset'):
                # "path1 400w, path2 800w, path3" — one path per comma-
                # separated entry, as the first whitespace-separated token.
                for entry in value.split(','):
                    entry = entry.strip()
                    if not entry:
                        continue
                    ref = _normalize_reference(entry.split()[0])
                    if ref:
                        self.found.add(ref)
            else:
                ref = _normalize_reference(value)
                if ref:
                    self.found.add(ref)


def _extract_from_html(html_text):
    if not html_text:
        return set()
    parser = _ReferenceExtractor()
    try:
        parser.feed(html_text)
        parser.close()
    except Exception:
        # Fails safe: whatever was already found before the parse error
        # stays protected, and worst case a malformed fragment causes a file
        # to be over-protected (never deleted) rather than the reverse.
        logger.exception('orphan_cleanup: failed to parse an HTML field — treating as no further references '
                          'found in it beyond what was already extracted before the error.')
    return parser.found


def _expand_with_responsive_siblings(names):
    """Any referenced {base}.webp implies {base}_400w/_800w/_1200w.webp are
    also live, even when nothing literally references them — confirmed
    avatar_filename/thumbnail_filename/image_filename/favicon_filename all
    discard the srcset and store only the base filename, so the variants
    exist on disk with no literal reference anywhere except this rule."""
    expanded = set(names)
    for name in names:
        if name.endswith('.webp') and not any(name.endswith(f'_{w}w.webp') for w in (400, 800, 1200)):
            base = name[:-len('.webp')]
            for w in (400, 800, 1200):
                expanded.add(f'{base}_{w}w.webp')
    return expanded


def _collect_referenced_filenames():
    from models import SiteConfig, AdminAccount, BlogPost, Page, User, Project, SiteEventLog

    # favicon.ico is a fixed filename, always the current one by
    # construction (save_favicon() overwrites it in place) — never tracked
    # by any column, so it's seeded directly rather than "discovered".
    referenced = {'favicon.ico'}

    config = SiteConfig.query.first()
    if config:
        if config.favicon_filename:
            referenced.add(config.favicon_filename)
        for field in _SITECONFIG_TEXT_FIELDS:
            referenced |= _extract_from_html(getattr(config, field))

    for (avatar,) in AdminAccount.query.with_entities(AdminAccount.avatar_filename).all():
        if avatar:
            referenced.add(avatar)

    # ALL statuses (draft/scheduled/published) — the rest of this codebase
    # filters to status='published' for public-facing queries, but that
    # filter has no business here: an unpublished draft's media is just as
    # real a reference as a published post's.
    for thumbnail, list_thumbnail, content_html in BlogPost.query.with_entities(
            BlogPost.thumbnail_filename, BlogPost.list_thumbnail_filename, BlogPost.content_html).all():
        if thumbnail:
            referenced.add(thumbnail)
        if list_thumbnail:
            referenced.add(list_thumbnail)
        referenced |= _extract_from_html(content_html)

    # Same "all statuses" reasoning as BlogPost above — Page mirrors its
    # draft/publish lifecycle (see models.py), and this was missing entirely
    # until now: a freeform Page's media had no reference path into this
    # scan at all, so it was always one grace period away from wrongly
    # being deleted regardless of whether the page was live and in use.
    for (content_html,) in Page.query.with_entities(Page.content_html).all():
        referenced |= _extract_from_html(content_html)

    # NOT User.avatar_url — that's an external Google-hosted URL, never a
    # local upload, and must not be treated as a filename.
    for (avatar,) in User.query.with_entities(User.avatar_filename).all():
        if avatar:
            referenced.add(avatar)

    for (image,) in Project.query.with_entities(Project.image_filename).all():
        if image:
            referenced.add(image)

    # A historical snapshot of an admin's avatar at the time of an audit-log
    # event — still counts even after that admin's own avatar later changes
    # or is cleared, since the log entry still displays it.
    for (avatar,) in SiteEventLog.query.with_entities(SiteEventLog.admin_avatar).all():
        if avatar:
            referenced.add(avatar)

    return _expand_with_responsive_siblings(referenced)


def _load_state(state_path):
    if not os.path.exists(state_path):
        return {}
    try:
        with open(state_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        # Fails safe in the conservative direction: losing this file only
        # means every currently-pending candidate restarts its grace period
        # from scratch, not that anything gets deleted early.
        logger.exception('orphan_cleanup: could not read state file %s — starting fresh.', state_path)
        return {}


def _save_state(state_path, state):
    tmp_path = state_path + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(state, f)
    os.replace(tmp_path, state_path)


def run_orphan_cleanup(dry_run=False):
    """Runs one mark-and-sweep cycle. Returns a dict summarizing what
    happened (or would happen, under dry_run) — see the per-key comments
    below. Deliberately does NOT catch broad exceptions from the DB/disk
    calls here (unlike watcher_alerts.send_watcher_alert): a failure in this
    function should be surfaced to the caller so it can alert, not silently
    treated as "nothing to clean up this run." Must be called inside an app
    context."""
    from upload_utils import get_app_data_dir, get_uploads_dir

    grace_seconds = int(os.getenv('ORPHAN_MEDIA_GRACE_DAYS', str(DEFAULT_GRACE_DAYS))) * 86400
    max_per_run = int(os.getenv('ORPHAN_MEDIA_MAX_PER_RUN', str(DEFAULT_MAX_PER_RUN)))

    uploads_dir = get_uploads_dir()
    state_path = os.path.join(get_app_data_dir(), STATE_FILENAME)

    referenced = _collect_referenced_filenames()
    on_disk = set()
    if os.path.isdir(uploads_dir):
        for name in os.listdir(uploads_dir):
            if os.path.isfile(os.path.join(uploads_dir, name)):
                on_disk.add(name)
    state = _load_state(state_path)

    now = time.time()
    unreferenced = on_disk - referenced

    # Reconcile bookkeeping first — these are always safe/reversible
    # (un-flagging something now referenced again, or dropping a stale
    # entry for a file that's already gone by other means), so they don't
    # count toward the circuit breaker below.
    referenced_again = {f for f in state if f in referenced}
    gone_from_disk = {f for f in state if f not in on_disk}
    to_reconcile = referenced_again | gone_from_disk

    to_flag_new = [f for f in unreferenced if f not in state]
    to_delete = [f for f in unreferenced if f in state and (now - state[f]) >= grace_seconds]

    total_actions = len(to_flag_new) + len(to_delete)
    if total_actions > max_per_run:
        logger.warning('orphan_cleanup: would touch %d files this run (flag %d, delete %d), exceeding '
                        'ORPHAN_MEDIA_MAX_PER_RUN=%d — aborting without changing anything.',
                        total_actions, len(to_flag_new), len(to_delete), max_per_run)
        return {
            'aborted': True,
            'would_flag': len(to_flag_new),
            'would_delete': len(to_delete),
            'cap': max_per_run,
        }

    flagged, deleted = [], []
    cleared = sorted(referenced_again)
    pruned = sorted(gone_from_disk)

    if not dry_run:
        for f in to_reconcile:
            del state[f]

        for f in to_flag_new:
            state[f] = now
            flagged.append(f)

        for f in to_delete:
            flagged_at = state.get(f, now)
            try:
                os.remove(os.path.join(uploads_dir, f))
                del state[f]
                deleted.append(f)
                logger.info('orphan_cleanup: deleted %s (unreferenced for %.1f days).',
                            f, (now - flagged_at) / 86400)
            except OSError:
                logger.exception('orphan_cleanup: failed to delete %s — leaving its candidate entry in '
                                  'place for the next run.', f)

        _save_state(state_path, state)
    else:
        flagged = to_flag_new
        deleted = to_delete  # "would delete" under dry-run

    return {
        'aborted': False,
        'dry_run': dry_run,
        'flagged': sorted(flagged),
        'deleted': sorted(deleted),
        'cleared': cleared,
        'pruned': pruned,
    }
