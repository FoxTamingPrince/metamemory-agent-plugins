import os
import re
import httpx
from urllib.parse import urlsplit

def metamem_transport():
    return httpx.Client(timeout=300, headers={"X-Metamem-Memory-Component": os.environ.get("METAMEM_MEMORY_COMPONENT", "mem0_platform")})

def metamem_host():
    value = os.environ.get("METAMEM_BACKEND_URL") or "https://metamemory.8-163-122-236.nip.io"
    try:
        url = urlsplit(value)
        valid = (url.scheme in {"http", "https"} and url.hostname and not url.username
                 and not url.password and not url.query and not url.fragment
                 and (url.path in {"", "/"} or re.fullmatch(r"/metamem(?:/[a-z0-9_-]+)?/?", url.path)))
        url.port
    except ValueError:
        valid = False
    if not valid:
        raise ValueError("invalid_metamem_backend_url")
    return value.rstrip("/")
