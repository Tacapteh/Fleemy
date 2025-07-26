import os
from pathlib import Path
import firebase_admin
from firebase_admin import credentials
from google.cloud import firestore

cred_path = os.environ.get(
    "FIREBASE_CREDENTIALS",
    str(Path(__file__).parent / "serviceAccountKey.json"),
)
if not firebase_admin._apps:
    cred = credentials.Certificate(cred_path)
    firebase_admin.initialize_app(cred)

db = firestore.client()
