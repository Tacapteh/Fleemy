import asyncio
from backend.firebase import db


async def stream_docs(query):
    """Helper to fetch documents from a query in a thread."""
    docs = await asyncio.to_thread(lambda: list(query.stream()))
    return [d.to_dict() for d in docs]

async def migrate():
    events_root = db.collection("events")
    years = await asyncio.to_thread(lambda: list(events_root.stream()))
    updated = 0
    for year_doc in years:
        year = year_doc.id
        week_cols = await asyncio.to_thread(lambda: list(year_doc.reference.collections()))
        for week_col in week_cols:
            week = week_col.id
            events = await stream_docs(week_col)
            for ev in events:
                if ev.get("owner_id") is None and ev.get("uid"):
                    doc_ref = week_col.document(ev["id"])
                    await asyncio.to_thread(doc_ref.update, {"owner_id": ev["uid"]})
                    updated += 1
                    print(f"Updated {year}/{week}/{ev['id']} -> owner_id={ev['uid']}")
    print(f"Migration completed. {updated} events updated.")

if __name__ == "__main__":
    asyncio.run(migrate())
