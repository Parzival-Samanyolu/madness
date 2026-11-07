#!/usr/bin/env python3
"""Measures how many chats the GPU handles at once. Standard library only.

usage: bench.py URL API_KEY [max_users]
Runs 1, 2, 4, 8, ... simultaneous requests and prints speed per user and in total.
"""
import json
import sys
import threading
import time
import urllib.request

URL, KEY = sys.argv[1].rstrip("/"), sys.argv[2]
MAX_USERS = int(sys.argv[3]) if len(sys.argv) > 3 else 16
PROMPT = "Write a detailed explanation of how a hash map works, with a Python implementation."


def one(results):
    body = json.dumps({"messages": [{"role": "user", "content": PROMPT}], "max_tokens": 400,
                       "chat_template_kwargs": {"reasoning_effort": "low"}}).encode()
    req = urllib.request.Request(f"{URL}/v1/chat/completions", data=body,
                                 headers={"Content-Type": "application/json", "Authorization": f"Bearer {KEY}"})
    t = time.time()
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            data = json.load(r)
        results.append((data["usage"]["completion_tokens"], time.time() - t))
    except Exception as e:  # noqa: BLE001
        print("  request failed:", e)


print(f"{'users':>6} {'tok/s per user':>15} {'tok/s total':>12} {'slowest (s)':>12}")
n = 1
while n <= MAX_USERS:
    results: list = []
    threads = [threading.Thread(target=one, args=(results,)) for _ in range(n)]
    start = time.time()
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    wall = time.time() - start
    if results:
        per_user = sum(tok / sec for tok, sec in results) / len(results)
        total = sum(tok for tok, _ in results) / wall
        print(f"{n:>6} {per_user:>15.1f} {total:>12.1f} {max(s for _, s in results):>12.1f}", flush=True)
    n *= 2
print("\nRule of thumb: keep 'tok/s per user' above ~15 (faster than people read).")
print("Change chats-at-once with:  sudo madness set LLM_PARALLEL 12   (then it restarts the model)")
