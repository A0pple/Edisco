import asyncio
from wiki_client import WikiClient

async def verify_sorting():
    client = WikiClient()
    
    print("Fetching top 10 positive edits (out of default max fetch)...")
    pos_edits = await client.get_recent_edits(limit=10, sort="size_desc")
    
    print(f"Got {len(pos_edits)} edits.")
    last_diff = float('inf')
    for i, edit in enumerate(pos_edits):
        diff = edit.get("newlen", 0) - edit.get("oldlen", 0)
        print(f"#{i+1}: {edit['title']} (Diff: {diff})")
        if diff > last_diff:
            print("ERROR: Not sorted descending!")
            return
        last_diff = diff
        
    print("\nFetching top 10 negative edits...")
    neg_edits = await client.get_recent_edits(limit=10, sort="size_asc")
    
    last_diff = float('-inf')
    for i, edit in enumerate(neg_edits):
        diff = edit.get("newlen", 0) - edit.get("oldlen", 0)
        print(f"#{i+1}: {edit['title']} (Diff: {diff})")
        if diff < last_diff:
            print("ERROR: Not sorted ascending!")
            return
        last_diff = diff

    print("\nVerification Passed!")

if __name__ == "__main__":
    asyncio.run(verify_sorting())
