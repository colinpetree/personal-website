from app import create_app
from extensions import db
from models import Profile, SiteConfig, AdminAccount

app = create_app()

with app.app_context():
    db.create_all()

    if not Profile.query.first():
        profile = Profile(
            name='Colin Petree',
            title='Programmer',
            bio='Welcome to my personal website.'
        )
        db.session.add(profile)
        db.session.commit()
        print('Profile seeded.')
    else:
        print('Profile already exists.')

    if not SiteConfig.query.first():
        # Every non-home page gets an <h1> of its own nav label as a
        # starter, matching production's seed_initial_data (server.py) —
        # home is deliberately excluded (welcome text reads fine without a
        # redundant "Home" heading above it).
        config = SiteConfig(
            site_title='Colin Petree',
            home_enabled=True,
            home_page_name='Home',
            home_text='<p>Welcome to my personal website.</p>',
            blog_page_name='Blog',
            blog_text='<h1>Blog</h1>',
            projects_page_name='Projects',
            projects_text='<h1>Projects</h1>',
            about_page_name='About',
            about_text='<h1>About</h1>',
            contact_page_name='Contact',
            contact_text='<h1>Contact</h1>',
            ai_demo_page_name='AI Implementations',
            ai_demo_text='<h1>AI Implementations</h1>',
            payment_page_name='Payment',
            payment_text='<h1>Payment</h1>',
        )
        db.session.add(config)
        db.session.commit()
        print('SiteConfig seeded.')
    else:
        print('SiteConfig already exists.')

    if not AdminAccount.query.first():
        admin = AdminAccount(
            full_name='Admin',
            email='admin',
            role='owner',
        )
        admin.set_password('admin')
        db.session.add(admin)
        db.session.commit()
        print('Admin account seeded — login: admin / admin  (change this password!)')
    else:
        print('Admin account already exists.')
