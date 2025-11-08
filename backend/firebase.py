import os
import json
import logging
import uuid
from datetime import datetime
from pathlib import Path
import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)

# Déterminer le chemin vers la clé Firebase
cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")

if not cred_path:
    fallback = Path(__file__).parent / "serviceAccountKey.json"
    cred_path = str(fallback)
    logger.warning(f"⚠️ Variable GOOGLE_APPLICATION_CREDENTIALS absente, fallback local : {cred_path}")
else:
    logger.info(f"🟢 Clé Firebase détectée depuis l'env : {cred_path}")

# Initialisation de Firebase Admin si ce n’est pas déjà fait
if not firebase_admin._apps:
    # cred = credentials.Certificate(cred_path)
    # firebase_admin.initialize_app(cred)
    logger.info("✅ Firebase Admin initialisé (skipped for testing)")



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

    def set(self, data, merge=False):
        r = self._ref()
        if merge:
            r.update(dict(data))
        else:
            r.clear()
            r.update(dict(data))

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

    def collection(self, name):
        return InMemoryCollection(self.store, self.path + [name])


class InMemoryCollection:
    def __init__(self, store, path):
        self.store = store
        self.path = path
        self._filters = []
        self._order_field = None
        self._order_direction = None
        self._limit_count = None

    def document(self, doc_id):
        return InMemoryDocument(self.store, self.path + [doc_id])

    def add(self, data, document_id=None):
        doc_id = document_id or uuid.uuid4().hex
        doc = self.document(doc_id)
        doc.set(dict(data) if isinstance(data, dict) else data)
        return doc, None

    # Simplified query helpers
    def where(self, field, op, value):
        new_collection = InMemoryCollection(self.store, self.path)
        new_collection._filters = self._filters + [(field, op, value)]
        new_collection._order_field = self._order_field
        new_collection._order_direction = self._order_direction
        new_collection._limit_count = self._limit_count
        return new_collection

    def order_by(self, field, direction=None):
        new_collection = InMemoryCollection(self.store, self.path)
        new_collection._filters = self._filters
        new_collection._order_field = field
        new_collection._order_direction = direction
        new_collection._limit_count = self._limit_count
        return new_collection

    def limit(self, count):
        new_collection = InMemoryCollection(self.store, self.path)
        new_collection._filters = self._filters
        new_collection._order_field = self._order_field
        new_collection._order_direction = self._order_direction
        new_collection._limit_count = count
        return new_collection

    def stream(self):
        d = InMemoryDocument(self.store, self.path)._ref()

        class Snap:
            def __init__(self, doc_id, data):
                self.id = doc_id
                self._d = dict(data)

            def to_dict(self):
                return dict(self._d)

        # Apply filters
        results = []
        for k, v in d.items():
            if self._apply_filters(v):
                results.append(Snap(k, v))
        
        # Apply ordering
        if self._order_field:
            reverse = False
            direction = self._order_direction

            if isinstance(direction, str):
                reverse = direction.upper() == "DESCENDING"
            elif direction is not None:
                # Firestore exposes direction constants as objects which can be compared
                reverse = (
                    getattr(direction, "name", "").upper() == "DESCENDING"
                    or direction == getattr(Query, "DESCENDING", None)
                    or direction == getattr(getattr(firestore, "Query", object), "DESCENDING", None)
                )

            def _normalize_order_value(value):
                if value is None:
                    return (4, "")

                if isinstance(value, datetime):
                    return (0, value.timestamp())

                if isinstance(value, (int, float)):
                    return (1, float(value))

                iso_formatter = getattr(value, "isoformat", None)
                if callable(iso_formatter):
                    try:
                        return (2, iso_formatter())
                    except Exception:  # pragma: no cover - defensive fallback
                        pass

                return (3, str(value))

            results.sort(
                key=lambda x: _normalize_order_value(x.to_dict().get(self._order_field)),
                reverse=reverse,
            )
        
        # Apply limit
        if self._limit_count:
            results = results[:self._limit_count]
        
        return results

    def _apply_filters(self, data):
        for field, op, value in self._filters:
            field_value = data.get(field)
            if op == "==":
                if field_value != value:
                    return False
            elif op == "!=":
                if field_value == value:
                    return False
            elif op == ">":
                if not (field_value and field_value > value):
                    return False
            elif op == ">=":
                if not (field_value and field_value >= value):
                    return False
            elif op == "<":
                if not (field_value and field_value < value):
                    return False
            elif op == "<=":
                if not (field_value and field_value <= value):
                    return False
        return True


class Query:
    DESCENDING = "DESCENDING"
    ASCENDING = "ASCENDING"


class InMemoryFirestore:
    def __init__(self):
        self.store = {}
        self.Query = Query

    def collection(self, name):
        return InMemoryCollection(self.store, [name])


__all__ = ["db", "InMemoryFirestore", "initialize_firestore"]


def initialize_firestore():
    env_project = os.environ.get("FIREBASE_PROJECT_ID")
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
                print(f"🟩 Clé Firebase utilisée : {cred_path}")

                firebase_admin.initialize_app(cred)
            logger.info("Initialized Firestore with provided credentials")
            return firestore.client()
        raise FileNotFoundError("Credential file not found")
    except Exception as e:
        logger.error(f"Failed to initialize Firestore: {e}")
        if not firebase_admin._apps and env_project:
            try:
                firebase_admin.initialize_app(options={"projectId": env_project})
                logger.warning(
                    "Initialized Firebase app with project_id=%s", env_project
                )  # ✅ FIXED token/projectId/trace
                return firestore.client()
            except Exception as init_exc:
                logger.error(
                    "Failed to initialize Firebase app with project ID: %s",
                    init_exc,
                )
        if not firebase_admin._apps:
            logger.warning(
                "No Firebase credentials found and FIREBASE_PROJECT_ID not set"
            )
        return InMemoryFirestore()


db = InMemoryFirestore()
