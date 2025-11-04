import pytest

from .. import server


class DummyDoc:
    def __init__(self, doc_id, data):
        self.id = doc_id
        self._data = data or {}

    def to_dict(self):
        return self._data


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


class DummyDB:
    def __init__(self, teams):
        docs_by_id = {team_id: DummyDoc(team_id, data) for team_id, data in teams.items()}
        self._collections = {"teams": DummyTeamsCollection(docs_by_id)}

    def collection(self, name):
        if name not in self._collections:  # pragma: no cover - defensive
            raise KeyError(name)
        return self._collections[name]


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
