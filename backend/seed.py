from app import create_app
from extensions import db
from models import Profile

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
