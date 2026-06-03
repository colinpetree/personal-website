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
        config = SiteConfig(
            site_title='Colin Petree',
            home_enabled=True,
            home_page_name='Home',
            home_text='<p>Welcome to my personal website.</p>',
        )
        db.session.add(config)
        db.session.commit()
        print('SiteConfig seeded.')
    else:
        print('SiteConfig already exists.')

    if not AdminAccount.query.first():
        admin = AdminAccount(
            name='Admin',
            email='admin',
            is_primary=True,
        )
        admin.set_password('admin')
        db.session.add(admin)
        db.session.commit()
        print('Admin account seeded — login: admin / admin  (change this password!)')
    else:
        print('Admin account already exists.')
