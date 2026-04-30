from extensions import db

class Profile(db.Model):
    __tablename__ = 'profile'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    title = db.Column(db.String(100), nullable=False)
    bio = db.Column(db.Text, nullable=True)
