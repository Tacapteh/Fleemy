import pytest

from .. import server


class DummyDoc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data or {}
        self.exists = True

    def to_dict(self):
        return self._data

    def get(self):
        return self


class DummyQuery:
    def __init__(self, docs):
        self._docs = docs

    def stream(self):
        return list(self._docs)


class DummyTeamsCollection:
    def __init__(self, docs_by_id):
        self._docs_by_id = docs_by_id

    def where(self, field, op, value):
        matched = []
        for doc in self._docs_by_id.values():
            data = doc.to_dict()
            candidate = False

            if op == "array_contains":
                members = data.get(field)
                if isinstance(members, list) and value in members:
                    candidate = True
            elif op == "==":
                candidate = data.get(field) == value
            else:  # pragma: no cover - defensive for unexpected operators
                raise NotImplementedError(op)

            if candidate:
                matched.append(doc)

        return DummyQuery(matched)

    def get_doc(self, doc_id):
        return self._docs_by_id[doc_id]


class DummyTeamRef:
    def __init__(self, team_doc):
        self.id = team_doc.id
        self._team_doc = team_doc

    def get(self):
        return self._team_doc


class DummyMembershipCollection:
    def __init__(self, team_doc):
        self.parent = DummyTeamRef(team_doc)


class DummyMembershipRef:
    def __init__(self, team_doc):
        self.parent = DummyMembershipCollection(team_doc)


class DummyMembershipDoc:
    def __init__(self, doc_id, team_doc):
        self.id = doc_id
        self.reference = DummyMembershipRef(team_doc)

    def to_dict(self):
        return {}


class DummyCollectionGroupQuery:
    def __init__(self, docs):
        self._docs = docs

    def where(self, field, op, value):
        filtered = [doc for doc in self._docs if doc.id == value]
        return DummyCollectionGroupQuery(filtered)

    def stream(self):
        return list(self._docs)


class DummyDB:
    def __init__(self, teams):
        docs_by_id = {team_id: DummyDoc(team_id, data) for team_id, data in teams.items()}
        self._teams = DummyTeamsCollection(docs_by_id)
        self._collections = {"teams": self._teams}
        self._membership_docs = []

    def collection(self, name):
        if name not in self._collections:  # pragma: no cover - defensive
            raise KeyError(name)
        return self._collections[name]

    def collection_group(self, name):
        if name != "memberships":  # pragma: no cover - defensive
            raise KeyError(name)
        return DummyCollectionGroupQuery(self._membership_docs)

    def set_membership_docs(self, docs):
        self._membership_docs = docs


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio("asyncio")
async def test_get_my_teams_includes_owned_teams(monkeypatch):
    user_uid = "user-123"
    teams_payload = {
        "team-member": {
            "name": "Membres",
            "members": [user_uid, "other"],
            "owner_uid": "owner-1",
            "invite_code": "INVITE1",
        },
        "team-owner": {
            "name": "OwnerOnly",
            "members": None,
            "members_count": 4,
            "owner_uid": user_uid,
            "invite_code": "INVITE2",
        },
        "team-both": {
            "name": "Both",
            "members": [user_uid],
            "owner_uid": user_uid,
            "invite_code": "INVITE3",
        },
    }

    dummy_db = DummyDB(teams_payload)
    monkeypatch.setattr(server, "db", dummy_db)

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(server.asyncio, "to_thread", fake_to_thread)

    result = await server.get_my_teams(user={"uid": user_uid})

    assert result["success"] is True
    team_ids = {team["team_id"] for team in result["teams"]}
    assert team_ids == {"team-member", "team-owner", "team-both"}

    owner_team = next(team for team in result["teams"] if team["team_id"] == "team-owner")
    assert owner_team["members_count"] == 4


@pytest.mark.anyio("asyncio")
async def test_get_my_teams_includes_membership_documents(monkeypatch):
    user_uid = "user-legacy"
    teams_payload = {
        "team-legacy": {
            "name": "Legacy",
            "members": {"other": True, user_uid: {"active": True}},
            "ownerUid": "owner-legacy",
            "invite_code": "INVLEG",
        }
    }

    dummy_db = DummyDB(teams_payload)
    legacy_doc = dummy_db._teams.get_doc("team-legacy")
    dummy_db.set_membership_docs([DummyMembershipDoc(user_uid, legacy_doc)])
    monkeypatch.setattr(server, "db", dummy_db)

    async def fake_to_thread(func, *args, **kwargs):
        return func(*args, **kwargs)

    monkeypatch.setattr(server.asyncio, "to_thread", fake_to_thread)

    result = await server.get_my_teams(user={"uid": user_uid})

    assert result["success"] is True
    team_ids = {team["team_id"] for team in result["teams"]}
    assert team_ids == {"team-legacy"}

    legacy_team = result["teams"][0]
    assert legacy_team["owner_uid"] == "owner-legacy"
    assert legacy_team["members_count"] == 2
