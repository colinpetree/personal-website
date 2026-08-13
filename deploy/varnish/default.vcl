vcl 4.1;

# __BACKEND_PORT__ substituted by install.sh from the same single source of
# truth used for the systemd unit's GUNICORN_BIND — kept in sync so this
# port can never silently drift from where gunicorn actually listens.
backend default {
    .host = "127.0.0.1";
    .port = "__BACKEND_PORT__";
}

# Only localhost (i.e. the Flask app itself, via backend/varnish_purge.py)
# may issue PURGE/BAN requests.
acl purge_acl {
    "127.0.0.1";
}

sub vcl_recv {
    if (req.method == "PURGE" || req.method == "BAN") {
        if (client.ip !~ purge_acl) {
            return (synth(403, "Forbidden"));
        }
        if (req.method == "BAN") {
            ban("req.url ~ " + req.http.X-Ban-Pattern);
            return (synth(200, "Banned"));
        }
        return (purge);
    }

    # Admin/auth surfaces and anything carrying a session cookie always
    # bypass the cache — Flask-Login is cookie-based with no server-side
    # session store, so "has a session cookie" == "personalized request".
    if (req.url ~ "^/api/admin/" || req.url ~ "^/api/auth/") {
        return (pass);
    }
    if (req.http.Cookie ~ "session=") {
        return (pass);
    }
    if (req.method != "GET" && req.method != "HEAD") {
        return (pass);
    }

    # Allowlist of cacheable public GET endpoints — safer default than
    # cache-by-default given there's no origin Cache-Control to lean on for
    # anything except /api/uploads/.
    if (req.url ~ "^/api/uploads/" && req.url !~ "name=") {
        return (hash);
    }
    if (req.url ~ "^/api/blog(/|$|\?)" ||
        req.url ~ "^/api/projects(/|$|\?)" ||
        req.url ~ "^/api/site-config(/|$|\?)" ||
        req.url ~ "^/api/payment/comments") {
        return (hash);
    }
    return (pass);
}

sub vcl_backend_response {
    # Deliberately not setting beresp.do_gzip anywhere in this file —
    # compression is handled entirely at the nginx layer, per-client, after
    # Varnish (see deploy/nginx/personal-website.conf). Varnish must keep
    # storing/serving plain responses; adding do_gzip here would reintroduce
    # the classic Varnish+compression bug (one cached encoding served to
    # every client regardless of what they asked for).
    if (bereq.url ~ "^/api/uploads/") {
        set beresp.ttl = 365d;
    } else if (bereq.url ~ "^/api/(blog|projects|site-config|payment/comments)") {
        set beresp.ttl = 60s;     # safety-net TTL; real invalidation is the explicit ban
        set beresp.grace = 300s;  # serve slightly-stale during a purge race rather than a miss storm
    } else {
        set beresp.ttl = 0s;
        set beresp.uncacheable = true;
    }
}
