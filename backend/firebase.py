import os
import json
import logging
from pathlib import Path

import firebase_admin
from firebase_admin import credentials
from google.cloud import firestore


logger = logging.getLogger(__name__)

cred_path = os.environ.get(
    "FIREBASE_CREDENTIALS",
    str(Path(__file__).parent / "serviceAccountKey.json"),
)


class InMemoryDocument(dict):
    def __init__(self, store, path):
        super().__init__()
        self.store = store
        self.path = path

    def _ref(self):
        d = self.store
        for p in self.path:
            d = d.setdefault(p, {})
        return d

    def set(self, data):
        r = self._ref()
        r.clear()
        r.update(data)

    def update(self, data):
        self._ref().update(data)

    def get(self):
        data = self._ref()

        class Snap:
            def __init__(self, d):
                self._d = dict(d)
                self.exists = bool(d)

            def to_dict(self):
                return dict(self._d)

        return Snap(data)

    def delete(self):
        self._ref().clear()


class InMemoryCollection:
    def __init__(self, store, path):
        self.store = store
        self.path = path

    def document(self, doc_id):
        return InMemoryDocument(self.store, self.path + [doc_id])

    # Simplified query helpers
    def where(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def limit(self, *args, **kwargs):
        return self

    def stream(self):
        d = InMemoryDocument(self.store, self.path)._ref()

        class Snap:
            def __init__(self, doc_id, data):
                self.id = doc_id
                self._d = dict(data)

            def to_dict(self):
                return dict(self._d)

        for k, v in d.items():
            yield Snap(k, v)


class InMemoryFirestore:
    def __init__(self):
        self.store = {}

    def collection(self, name):
        return InMemoryCollection(self.store, [name])


__all__ = ["db", "InMemoryFirestore"]


def initialize_firestore():
    try:
        if cred_path and Path(cred_path).exists():
            with open(cred_path) as f:
                cred_data = json.load(f)
            if not cred_data.get("project_id"):
                env_project = os.environ.get("FIREBASE_PROJECT_ID")
                if env_project:
                    cred_data["project_id"] = env_project
            if not cred_data.get("client_email"):
                env_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
                if env_email:
                    cred_data["client_email"] = env_email
            cred = credentials.Certificate(cred_data)
            if not firebase_admin._apps:
                firebase_admin.initialize_app(cred)
            logger.info("Initialized Firestore with provided credentials")
            return firestore.client()
        raise FileNotFoundError("Credential file not found")
    except Exception as e:
        logger.error(f"Failed to initialize Firestore: {e}")
        return InMemoryFirestore()


db = initialize_firestore()

