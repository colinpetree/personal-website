import os
from cryptography.fernet import Fernet


def _fernet():
    key = os.getenv('ENCRYPTION_KEY')
    if not key:
        raise RuntimeError('ENCRYPTION_KEY is not set in environment')
    return Fernet(key.encode())


def encrypt(value: str) -> str:
    if not value:
        return value
    return _fernet().encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    if not value:
        return value
    return _fernet().decrypt(value.encode()).decode()
