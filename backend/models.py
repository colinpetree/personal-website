from datetime import datetime
from flask_login import UserMixin
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db


class Profile(db.Model):
    __tablename__ = 'profile'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    bio = db.Column(db.Text, nullable=True)


class SiteConfig(db.Model):
    __tablename__ = 'site_config'

    id = db.Column(db.Integer, primary_key=True)
    site_title = db.Column(db.String(200), nullable=False, default='My Website')
    site_description = db.Column(db.Text, nullable=True)

    # Home
    home_enabled = db.Column(db.Boolean, nullable=False, default=True)
    home_page_name = db.Column(db.String(100), nullable=False, default='Home')
    home_text = db.Column(db.Text, nullable=True)
    home_meta_description = db.Column(db.Text, nullable=True)

    # Blog
    blog_enabled = db.Column(db.Boolean, nullable=False, default=False)
    blog_page_name = db.Column(db.String(100), nullable=False, default='Blog')
    blog_slug = db.Column(db.String(100), nullable=False, default='blog')

    # Projects
    projects_enabled = db.Column(db.Boolean, nullable=False, default=False)
    projects_page_name = db.Column(db.String(100), nullable=False, default='Projects')
    projects_text = db.Column(db.Text, nullable=True)
    projects_meta_description = db.Column(db.Text, nullable=True)
    projects_slug = db.Column(db.String(100), nullable=False, default='projects')

    # About
    about_enabled = db.Column(db.Boolean, nullable=False, default=False)
    about_page_name = db.Column(db.String(100), nullable=False, default='About')
    about_text = db.Column(db.Text, nullable=True)
    about_meta_description = db.Column(db.Text, nullable=True)
    headshot_filename = db.Column(db.String(255), nullable=True)
    about_slug = db.Column(db.String(100), nullable=False, default='about')

    # Contact
    contact_enabled = db.Column(db.Boolean, nullable=False, default=False)
    contact_page_name = db.Column(db.String(100), nullable=False, default='Contact')
    contact_slug = db.Column(db.String(100), nullable=False, default='contact')
    mailgun_api_key = db.Column(db.Text, nullable=True)  # stored encrypted
    mailgun_domain = db.Column(db.String(255), nullable=True)
    smtp_from_email = db.Column(db.String(255), nullable=True)
    forward_email = db.Column(db.String(255), nullable=True)

    # AI Demo
    ai_demo_enabled = db.Column(db.Boolean, nullable=False, default=False)
    ai_demo_page_name = db.Column(db.String(100), nullable=False, default='AI Implementations')
    ai_demo_slug = db.Column(db.String(100), nullable=False, default='demo')

    # Donate
    donate_enabled = db.Column(db.Boolean, nullable=False, default=False)
    donate_page_name = db.Column(db.String(100), nullable=False, default='Donate')
    donate_slug = db.Column(db.String(100), nullable=False, default='donate')
    stripe_publishable_key = db.Column(db.Text, nullable=True)
    stripe_secret_key = db.Column(db.Text, nullable=True)  # stored encrypted
    stripe_webhook_secret = db.Column(db.Text, nullable=True)  # stored encrypted
    donation_comments_enabled = db.Column(db.Boolean, nullable=False, default=True)

    # Site-wide
    domain = db.Column(db.String(255), nullable=True)
    favicon_filename = db.Column(db.String(255), nullable=True)
    timezone = db.Column(db.String(100), nullable=False, default='Etc/UTC')
    users_enabled = db.Column(db.Boolean, nullable=False, default=False)
    google_oauth_client_id = db.Column(db.Text, nullable=True)
    google_oauth_client_secret = db.Column(db.Text, nullable=True)  # stored encrypted


class AdminAccount(UserMixin, db.Model):
    __tablename__ = 'admin_account'

    id = db.Column(db.Integer, primary_key=True)
    full_name = db.Column(db.String(200), nullable=False)
    title = db.Column(db.String(100), nullable=True)
    location = db.Column(db.String(200), nullable=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False, default='administrator')
    avatar_filename = db.Column(db.String(255), nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    reset_token = db.Column(db.String(255), nullable=True)
    reset_token_expires = db.Column(db.DateTime, nullable=True)
    failed_login_attempts = db.Column(db.Integer, nullable=False, default=0)
    lockout_until = db.Column(db.DateTime, nullable=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)


class LoginAttempt(db.Model):
    __tablename__ = 'login_attempt'

    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45), nullable=False)  # fits IPv6
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class PortalLinkRequest(db.Model):
    __tablename__ = 'portal_link_request'

    id = db.Column(db.Integer, primary_key=True)
    ip_address = db.Column(db.String(45), nullable=False)  # fits IPv6
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)


class BlogPost(db.Model):
    __tablename__ = 'blog_post'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(500), nullable=False)
    slug = db.Column(db.String(500), nullable=False, unique=True)
    content_html = db.Column(db.Text, nullable=True)
    excerpt = db.Column(db.Text, nullable=True)
    meta_description = db.Column(db.String(500), nullable=True)
    status = db.Column(db.String(20), nullable=False, default='draft')  # draft | scheduled | published
    publish_date = db.Column(db.DateTime, nullable=True)
    thumbnail_filename = db.Column(db.String(255), nullable=True)
    thumbnail_caption = db.Column(db.String(500), nullable=True)
    thumbnail_width = db.Column(db.Integer, nullable=True)
    thumbnail_height = db.Column(db.Integer, nullable=True)
    author_id = db.Column(db.Integer, db.ForeignKey('admin_account.id'), nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    comments = db.relationship('Comment', backref='post', lazy='dynamic', cascade='all, delete-orphan')


class User(db.Model):
    __tablename__ = 'user'

    id = db.Column(db.Integer, primary_key=True)
    google_id = db.Column(db.String(255), nullable=False, unique=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    name = db.Column(db.String(200), nullable=False)
    title = db.Column(db.String(200), nullable=True)
    avatar_url = db.Column(db.Text, nullable=True)
    can_comment = db.Column(db.Boolean, nullable=False, default=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    comments = db.relationship('Comment', backref='user', lazy='dynamic')


class Comment(db.Model):
    __tablename__ = 'comment'

    id = db.Column(db.Integer, primary_key=True)
    post_id = db.Column(db.Integer, db.ForeignKey('blog_post.id'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('admin_account.id'), nullable=True)
    parent_id = db.Column(db.Integer, db.ForeignKey('comment.id'), nullable=True)
    content = db.Column(db.Text, nullable=False)
    guest_name = db.Column(db.String(200), nullable=True)
    guest_email = db.Column(db.String(255), nullable=True)
    like_count = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    is_deleted = db.Column(db.Boolean, nullable=False, default=False)

    replies = db.relationship(
        'Comment',
        backref=db.backref('parent', remote_side='Comment.id'),
        lazy='dynamic',
    )


class Project(db.Model):
    __tablename__ = 'project'

    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=True)
    url = db.Column(db.String(500), nullable=True)
    image_filename = db.Column(db.String(255), nullable=True)
    order = db.Column(db.Integer, nullable=False, default=0)
    visible = db.Column(db.Boolean, nullable=False, default=True)


class Donation(db.Model):
    __tablename__ = 'donation'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=True)
    email = db.Column(db.String(255), nullable=True)
    display_name = db.Column(db.String(200), nullable=True)
    message = db.Column(db.Text, nullable=True)
    comment_visible = db.Column(db.Boolean, nullable=False, default=True)
    stripe_customer_id = db.Column(db.String(255), nullable=True)
    stripe_subscription_id = db.Column(db.String(255), nullable=True)
    stripe_object_id = db.Column(db.String(255), nullable=False, unique=True)  # checkout session or invoice id
    amount = db.Column(db.Float, nullable=False)
    mode = db.Column(db.String(20), nullable=False)  # payment | subscription
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship('User', backref='donations')


class SiteEventLog(db.Model):
    __tablename__ = 'site_event_log'

    id = db.Column(db.Integer, primary_key=True)
    admin_id = db.Column(db.Integer, db.ForeignKey('admin_account.id'), nullable=True)
    admin_name = db.Column(db.String(200), nullable=False)
    admin_avatar = db.Column(db.String(255), nullable=True)
    area = db.Column(db.String(50), nullable=False)   # Post | Page | Comment | User | Settings
    action_type = db.Column(db.String(20), nullable=False)  # added | edited | deleted
    subject = db.Column(db.String(300), nullable=False)
    subject_suffix = db.Column(db.String(200), nullable=True)
    subject_is_bold = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    admin = db.relationship('AdminAccount', backref='events', foreign_keys=[admin_id])
