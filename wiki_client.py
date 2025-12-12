import httpx
import json
import asyncio
import logging
import time
from typing import List, Dict, Optional, AsyncGenerator

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class WikiClient:
    BASE_URL = "https://he.wikipedia.org/w/api.php"
    STREAM_URL = "https://stream.wikimedia.org/v2/stream/recentchange"

    def __init__(self):
        self.client = httpx.AsyncClient(headers={
            "User-Agent": "Edisco/1.0 (https://github.com/yourusername/edisco; edisco@example.com)"
        }, timeout=30.0) # Increased timeout for batch operations

    async def get_recent_edits_stream(self) -> AsyncGenerator[Dict, None]:
        """
        Connects to the Wikimedia EventStreams SSE and yields Hebrew Wikipedia edits.
        """
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("GET", self.STREAM_URL) as response:
                async for line in response.aiter_lines():
                    if line.startswith("data: "):
                        try:
                            data = json.loads(line[6:])
                            if data.get("server_name") == "he.wikipedia.org" and data.get("type") == "edit":
                                yield data
                        except json.JSONDecodeError:
                            continue
                        except Exception as e:
                            logger.error(f"Error processing stream data: {e}")

    async def search_edits(self, query: str, limit: int = 500, period: str = "7d") -> List[Dict]:
        """
        Searches recent edits (last 7 days or 24h) for a specific word in added/removed content.
        Optimized to use batch diff fetching.
        """
        # 1. Get recent changes
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        
        if period == "24h":
            start_time = now - timedelta(hours=24)
        else:
            start_time = now - timedelta(days=7)

        # Fetch recent changes (ids only first to be fast?) 
        # Actually we need metadata too.
        params = {
            "action": "query",
            "list": "recentchanges",
            "rcprop": "ids|title|user|timestamp|comment|sizes",
            "rclimit": limit,
            "rcend": start_time.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "rcnamespace": 0,
            "format": "json"
        }
        
        try:
            response = await self.client.get(self.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()
            recent_changes = data.get("query", {}).get("recentchanges", [])
        except Exception as e:
            logger.error(f"Error fetching recent changes: {e}")
            return []

        results = []
        
        # 2. Batch fetch diffs
        # We can fetch up to 50 revisions at a time
        rev_ids = [rc["revid"] for rc in recent_changes if "revid" in rc]
        
        # Map revid to rc object for easy access
        rc_map = {rc["revid"]: rc for rc in recent_changes if "revid" in rc}
        
        chunk_size = 50
        for i in range(0, len(rev_ids), chunk_size):
            chunk = rev_ids[i:i + chunk_size]
            if not chunk: continue
            
            diff_params = {
                "action": "query",
                "prop": "revisions",
                "rvdiffto": "prev",
                "revids": "|".join(map(str, chunk)),
                "format": "json"
            }
            
            try:
                diff_resp = await self.client.get(self.BASE_URL, params=diff_params)
                diff_data = diff_resp.json()
                pages = diff_data.get("query", {}).get("pages", {})
                
                for page_id, page_data in pages.items():
                    if "revisions" in page_data:
                        for rev in page_data["revisions"]:
                            revid = rev.get("revid")
                            diff_html = rev.get("diff", {}).get("*", "")
                            
                            if not diff_html:
                                continue
                                
                            if query in diff_html:
                                rc = rc_map.get(revid)
                                if not rc: continue
                                
                                status = "unknown"
                                # Simple heuristic for added/removed
                                if "diff-addedline" in diff_html and query in diff_html.split("diff-addedline")[1].split("</td>")[0]:
                                     status = "added"
                                elif "diff-deletedline" in diff_html and query in diff_html.split("diff-deletedline")[1].split("</td>")[0]:
                                     status = "removed"
                                
                                if status != "unknown" or query in diff_html:
                                     # Create a copy to avoid mutating if shared (though here it's unique)
                                     result_rc = rc.copy()
                                     result_rc["status"] = status
                                     results.append(result_rc)
            except Exception as e:
                logger.error(f"Error fetching diff batch: {e}")

        # 3. Fetch images for results
        if results:
            page_ids = [str(edit["pageid"]) for edit in results if "pageid" in edit]
            # Deduplicate
            page_ids = list(set(page_ids))
            
            chunk_size = 50
            for i in range(0, len(page_ids), chunk_size):
                chunk = page_ids[i:i + chunk_size]
                if not chunk: continue
                
                img_params = {
                    "action": "query",
                    "prop": "pageimages",
                    "pithumbsize": 100,
                    "pageids": "|".join(chunk),
                    "format": "json"
                }
                try:
                    img_resp = await self.client.get(self.BASE_URL, params=img_params)
                    img_data = img_resp.json()
                    pages = img_data.get("query", {}).get("pages", {})
                    
                    for edit in results:
                        pid = str(edit.get("pageid"))
                        if pid in pages:
                            thumbnail = pages[pid].get("thumbnail", {})
                            if thumbnail:
                                edit["thumbnail"] = thumbnail.get("source")
                except Exception as e:
                    logger.error(f"Error fetching images for search results: {e}")

        return results

    async def _fetch_edits_worker(self, start_time, end_time, max_fetch, namespace: int = 0, anon_only: bool = False, props: str = "ids|title|user|timestamp|comment|sizes") -> List[Dict]:
        """
        Worker to fetch edits for a specific time range.
        """
        edits_chunk = []
        continue_token = None
        
        while len(edits_chunk) < max_fetch:
            params = {
                "action": "query",
                "list": "recentchanges",
                "rcprop": props, 
                "rcnamespace": namespace,
                "format": "json",
                "rclimit": min(500, max_fetch - len(edits_chunk))
            }
            
            # rcstart is implicitly 'now' if not set, but we want to respect the range
            if start_time:
                params["rcstart"] = start_time.strftime("%Y-%m-%dT%H:%M:%SZ")
            
            if end_time:
                params["rcend"] = end_time.strftime("%Y-%m-%dT%H:%M:%SZ")
            
            if continue_token:
                params["rccontinue"] = continue_token

            if anon_only:
                params["rcshow"] = "anon"

            try:
                response = await self.client.get(self.BASE_URL, params=params)
                response.raise_for_status()
                data = response.json()
                batch = data.get("query", {}).get("recentchanges", [])
                
                if not batch:
                    break
                    
                edits_chunk.extend(batch)
                
                if "continue" in data:
                    continue_token = data["continue"].get("rccontinue")
                else:
                    break
                    
            except Exception as e:
                logger.error(f"Error fetching edits worker batch: {e}")
                break
                
        return edits_chunk

    async def get_recent_edits(self, limit: int = 50, period: Optional[str] = None, max_fetch: int = 500, fetch_images: bool = True, namespace: int = 0, anon_only: bool = False, props: str = "ids|title|user|timestamp|comment|sizes") -> List[Dict]:
        """
        Fetches recent edits. 
        Optimized: Uses parallel fetching for '7d' period.
        """
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        
        all_edits = []

        if period == "7d":
            # Parallel fetch strategy for 7 days
            # Split into smaller chunks (e.g. 6 hours) to increase parallelism and speed
            tasks = []
            
            # 7 days * 4 chunks per day = 28 chunks
            chunks_per_day = 4
            hours_per_chunk = 24 / chunks_per_day
            
            # We want to fetch roughly max_fetch total. 
            per_chunk_limit = max(200, int(max_fetch / 20)) # Divide by ~20 instead of 28 to be safe
            
            for i in range(7 * chunks_per_day):
                # Chunk i: from (now - i*6h) to (now - (i+1)*6h)
                t_start = now - timedelta(hours=i*hours_per_chunk)
                t_end = now - timedelta(hours=(i+1)*hours_per_chunk)
                
                tasks.append(self._fetch_edits_worker(t_start, t_end, per_chunk_limit, namespace, anon_only, props))
            
            results = await asyncio.gather(*tasks)
            for res in results:
                all_edits.extend(res)
                
            # Sort by timestamp (newest first)
            all_edits.sort(key=lambda x: x["timestamp"], reverse=True)
            
            # Trim to max_fetch
            all_edits = all_edits[:max_fetch]
            
        else:
            # Standard sequential fetch
            end_time = None
            if period == "1h":
                end_time = now - timedelta(hours=1)
            elif period == "24h":
                end_time = now - timedelta(hours=24)
            else:
                # Default or custom limit without period
                pass # end_time remains None
                
            all_edits = await self._fetch_edits_worker(None, end_time, max_fetch, namespace, anon_only, props)

        # Fetch images for all collected edits if requested
        if fetch_images and all_edits:
            # Deduplicate by pageid to save requests
            page_ids = list(set([str(edit["pageid"]) for edit in all_edits if "pageid" in edit]))
            
            # Split into chunks of 50
            chunk_size = 50
            for i in range(0, len(page_ids), chunk_size):
                chunk = page_ids[i:i + chunk_size]
                if not chunk: continue
                
                img_params = {
                    "action": "query",
                    "prop": "pageimages",
                    "pithumbsize": 100,
                    "pageids": "|".join(chunk),
                    "format": "json"
                }
                try:
                    img_resp = await self.client.get(self.BASE_URL, params=img_params)
                    img_data = img_resp.json()
                    pages = img_data.get("query", {}).get("pages", {})
                    
                    # Map images back to edits
                    for edit in all_edits:
                        pid = str(edit.get("pageid"))
                        if pid in pages:
                            thumbnail = pages[pid].get("thumbnail", {})
                            if thumbnail:
                                edit["thumbnail"] = thumbnail.get("source")
                except Exception as e:
                    logger.error(f"Error fetching images for chunk: {e}")

        return all_edits

    # Simple async cache decorator
    def async_cache(ttl: int = 30):
        def decorator(func):
            cache = {}
            
            async def wrapper(self, *args, **kwargs):
                # Create a key based on args and kwargs
                # We assume args are hashable (int, str). 
                # kwargs might need sorting.
                key = (args, tuple(sorted(kwargs.items())))
                
                now = time.time()
                if key in cache:
                    result, timestamp = cache[key]
                    if now - timestamp < ttl:
                        return result
                
                result = await func(self, *args, **kwargs)
                cache[key] = (result, now)
                return result
            return wrapper
        return decorator

    @async_cache(ttl=300)
    async def get_top_edited_articles(self, limit: int = 25, period: str = "24h", anon_only: bool = False) -> List[Dict]:
        """
        Fetches top edited articles in the last `period`, ranked by UNIQUE users.
        """
        # Fetch a large number of recent edits to aggregate
        # We need enough edits to get meaningful data, especially for 7d
        # Increased limits to ensure better coverage
        max_fetch = 10000 if period == "7d" else 2000
        # Minimal props for aggregation
        edits = await self.get_recent_edits(limit=max_fetch, period=period, max_fetch=max_fetch, fetch_images=False, anon_only=anon_only, props="ids|title|user|timestamp")
        
        from collections import defaultdict
        
        # Count unique users per title
        title_users = defaultdict(set)
        title_info = {} # Store basic info like pageid to fetch images later if needed
        
        for edit in edits:
            title = edit.get("title")
            user = edit.get("user")
            if title and user:
                title_users[title].add(user)
                if title not in title_info:
                    title_info[title] = {
                        "pageid": edit.get("pageid"),
                        "title": title
                    }
        
        # Convert to list of dicts with count
        results = []
        for title, users in title_users.items():
            info = title_info.get(title, {"title": title})
            info["count"] = len(users)
            results.append(info)
            
        # Sort by count descending
        results.sort(key=lambda x: x["count"], reverse=True)
        
        # Take top N
        results = results[:limit]
            
        # Fetch images for top articles
        if results:
            page_ids = [str(r["pageid"]) for r in results if "pageid" in r]
            chunk_size = 50
            for i in range(0, len(page_ids), chunk_size):
                chunk = page_ids[i:i + chunk_size]
                if not chunk: continue
                
                img_params = {
                    "action": "query",
                    "prop": "pageimages",
                    "pithumbsize": 100,
                    "pageids": "|".join(chunk),
                    "format": "json"
                }
                try:
                    img_resp = await self.client.get(self.BASE_URL, params=img_params)
                    img_data = img_resp.json()
                    pages = img_data.get("query", {}).get("pages", {})
                    
                    for r in results:
                        pid = str(r.get("pageid"))
                        if pid in pages:
                            thumbnail = pages[pid].get("thumbnail", {})
                            if thumbnail:
                                r["thumbnail"] = thumbnail.get("source")
                except Exception as e:
                    logger.error(f"Error fetching images for top articles: {e}")
                    
        return results

    @async_cache(ttl=300)
    async def get_top_editors(self, limit: int = 25, period: str = "24h", anon_only: bool = False) -> List[Dict]:
        """
        Fetches top editors in the last `period`, ranked by number of edits.
        """
        # Fetch a large number of recent edits to aggregate
        # Increased limits significantly to ensure accuracy for "most edits"
        max_fetch = 25000 if period == "7d" else 5000
        # Minimal props for aggregation
        edits = await self.get_recent_edits(limit=max_fetch, period=period, max_fetch=max_fetch, fetch_images=False, anon_only=anon_only, props="ids|title|user|timestamp")
        
        from collections import Counter
        
        # Count edits per user
        user_counts = Counter()
        
        for edit in edits:
            user = edit.get("user")
            if user:
                user_counts[user] += 1
        
        # Convert to list of dicts
        results = []
        for user, count in user_counts.most_common(limit):
            results.append({
                "user": user,
                "count": count
            })
            
        return results

    @async_cache(ttl=300)
    async def get_top_talk_pages(self, limit: int = 25, period: str = "24h", anon_only: bool = False) -> List[Dict]:
        """
        Fetches top talk pages in the last `period`, ranked by UNIQUE users.
        """
        # Fetch a large number of recent edits to aggregate
        max_fetch = 10000 if period == "7d" else 2000
        # namespace=1 is Talk
        # Minimal props for aggregation
        edits = await self.get_recent_edits(limit=max_fetch, period=period, max_fetch=max_fetch, fetch_images=False, namespace=1, anon_only=anon_only, props="ids|title|user|timestamp")
        
        from collections import defaultdict
        
        # Count unique users per title
        title_users = defaultdict(set)
        title_info = {} 
        
        for edit in edits:
            title = edit.get("title")
            user = edit.get("user")
            if title and user:
                title_users[title].add(user)
                if title not in title_info:
                    title_info[title] = {
                        "pageid": edit.get("pageid"),
                        "title": title
                    }
        
        # Convert to list of dicts with count
        results = []
        for title, users in title_users.items():
            info = title_info.get(title, {"title": title})
            info["count"] = len(users)
            results.append(info)
            
        # Sort by count descending
        results.sort(key=lambda x: x["count"], reverse=True)
        
        # Take top N
        results = results[:limit]
            
        # Fetch images from main articles
        if results:
            # Map clean title to result objects (could be multiple if normalization is tricky, but usually 1-1)
            clean_title_to_results = defaultdict(list)
            
            for r in results:
                title = r["title"]
                clean_title = title
                if title.startswith("שיחה:"):
                    clean_title = title.replace("שיחה:", "", 1)
                elif title.startswith("Talk:"):
                    clean_title = title.replace("Talk:", "", 1)
                
                clean_title_to_results[clean_title].append(r)
            
            clean_titles = list(clean_title_to_results.keys())
            
            chunk_size = 50
            for i in range(0, len(clean_titles), chunk_size):
                chunk = clean_titles[i:i + chunk_size]
                if not chunk: continue
                
                img_params = {
                    "action": "query",
                    "prop": "pageimages",
                    "pithumbsize": 100,
                    "titles": "|".join(chunk),
                    "format": "json"
                }
                try:
                    img_resp = await self.client.get(self.BASE_URL, params=img_params)
                    img_data = img_resp.json()
                    pages = img_data.get("query", {}).get("pages", {})
                    
                    for pid, pdata in pages.items():
                        if "thumbnail" in pdata:
                            api_title = pdata.get("title")
                            thumb_url = pdata["thumbnail"]["source"]
                            
                            # Try to match with our clean titles
                            if api_title in clean_title_to_results:
                                for r in clean_title_to_results[api_title]:
                                    r["thumbnail"] = thumb_url
                            
                except Exception as e:
                    logger.error(f"Error fetching images for top talk pages: {e}")

        return results

    @async_cache(ttl=60)
    async def get_new_articles(self, limit: int = 25, period: str = "24h", anon_only: bool = False) -> List[Dict]:
        """
        Fetches newly created articles.
        """
        from datetime import datetime, timedelta
        now = datetime.utcnow()
        
        start_time = None
        if period == "24h":
            start_time = now - timedelta(hours=24)
        elif period == "7d":
            start_time = now - timedelta(days=7)
        elif period == "1h":
            start_time = now - timedelta(hours=1)
            
        params = {
            "action": "query",
            "list": "recentchanges",
            "rcprop": "ids|title|user|timestamp|comment|sizes|tags",
            "rclimit": limit,
            "rctype": "new",
            "rcnamespace": 0,
            "format": "json"
        }
        
        if start_time:
            params["rcend"] = start_time.strftime("%Y-%m-%dT%H:%M:%SZ")

        if anon_only:
            params["rcshow"] = "anon"

        try:
            response = await self.client.get(self.BASE_URL, params=params)
            response.raise_for_status()
            data = response.json()
            new_articles = data.get("query", {}).get("recentchanges", [])
            
            # Fetch images
            if new_articles:
                page_ids = [str(a["pageid"]) for a in new_articles if "pageid" in a]
                chunk_size = 50
                for i in range(0, len(page_ids), chunk_size):
                    chunk = page_ids[i:i + chunk_size]
                    if not chunk: continue
                    
                    img_params = {
                        "action": "query",
                        "prop": "pageimages",
                        "pithumbsize": 100,
                        "pageids": "|".join(chunk),
                        "format": "json"
                    }
                    try:
                        img_resp = await self.client.get(self.BASE_URL, params=img_params)
                        img_data = img_resp.json()
                        pages = img_data.get("query", {}).get("pages", {})
                        
                        for article in new_articles:
                            pid = str(article.get("pageid"))
                            if pid in pages:
                                thumbnail = pages[pid].get("thumbnail", {})
                                if thumbnail:
                                    article["thumbnail"] = thumbnail.get("source")
                    except Exception as e:
                        logger.error(f"Error fetching images for new articles: {e}")
            
            return new_articles
            
        except Exception as e:
            logger.error(f"Error fetching new articles: {e}")
            return []

    @async_cache(ttl=300) # Cache for 5 minutes
    async def get_top_viewed_articles(self, limit: int = 25, period: str = "24h") -> List[Dict]:
        """
        Fetches top viewed articles.
        If period="24h", fetches from yesterday.
        If period="7d", fetches last 7 days and aggregates.
        """
        from datetime import datetime, timedelta
        from collections import defaultdict
        
        # Helper to fetch one day
        async def fetch_day(date):
            year = date.strftime("%Y")
            month = date.strftime("%m")
            day = date.strftime("%d")
            url = f"https://wikimedia.org/api/rest_v1/metrics/pageviews/top/he.wikipedia/all-access/{year}/{month}/{day}"
            try:
                response = await self.client.get(url)
                response.raise_for_status()
                data = response.json()
                items = data.get("items", [])
                if items:
                    return items[0].get("articles", [])
            except Exception as e:
                logger.error(f"Error fetching top viewed for {date}: {e}")
            return []

        # Determine dates to fetch
        dates_to_fetch = []
        yesterday = datetime.utcnow() - timedelta(days=1)
        
        if period == "7d":
            for i in range(7):
                dates_to_fetch.append(yesterday - timedelta(days=i))
        else:
            dates_to_fetch.append(yesterday)
            
        # Fetch in parallel
        tasks = [fetch_day(date) for date in dates_to_fetch]
        results_list = await asyncio.gather(*tasks)
        
        # Aggregate
        article_views = defaultdict(int)
        
        for day_articles in results_list:
            for article in day_articles:
                title = article.get("article")
                views = article.get("views")
                
                # Filter special pages
                if title == "עמוד_ראשי" or title.startswith("מיוחד:") or title.startswith("ויקיפדיה:"):
                    continue
                    
                article_views[title] += views
                
        # Convert to list and sort
        sorted_articles = sorted(article_views.items(), key=lambda x: x[1], reverse=True)
        
        # Format results
        results = []
        for i, (title, views) in enumerate(sorted_articles[:limit]):
            display_title = title.replace("_", " ")
            results.append({
                "title": display_title,
                "views": views,
                "rank": i + 1,
                "page_title_for_api": title
            })
            
        # Fetch images
        if results:
            titles = [r["page_title_for_api"] for r in results]
            chunk_size = 50
            for i in range(0, len(titles), chunk_size):
                chunk = titles[i:i + chunk_size]
                if not chunk: continue
                
                img_params = {
                    "action": "query",
                    "prop": "pageimages",
                    "pithumbsize": 100,
                    "titles": "|".join(chunk),
                    "format": "json"
                }
                try:
                    img_resp = await self.client.get(self.BASE_URL, params=img_params)
                    img_data = img_resp.json()
                    pages = img_data.get("query", {}).get("pages", {})
                    
                    title_to_thumb = {}
                    for pid, pdata in pages.items():
                        if "thumbnail" in pdata:
                            api_title = pdata.get("title", "").replace(" ", "_")
                            title_to_thumb[api_title] = pdata["thumbnail"]["source"]
                            title_to_thumb[pdata.get("title", "")] = pdata["thumbnail"]["source"]

                    for r in results:
                        t_underscore = r["page_title_for_api"]
                        t_space = r["title"]
                        if t_underscore in title_to_thumb:
                            r["thumbnail"] = title_to_thumb[t_underscore]
                        elif t_space in title_to_thumb:
                            r["thumbnail"] = title_to_thumb[t_space]
                            
                except Exception as e:
                    logger.error(f"Error fetching images for top viewed: {e}")

        return results

    async def close(self):
        await self.client.aclose()
