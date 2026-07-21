#!/usr/bin/env python3
"""Pre-commit helper: report staged changes that leak a PROTECTED post's existence.

A protected post (front matter `protected: true`, published only as an encrypted
p/<token>/ stub — see _protect/README.md) must leak nothing through side channels:
  - _data/writing.yml is committed, so an index entry (title + /slug/) is a leak;
  - its images/attachments under assets/ are plaintext, so committing them is a leak.
Prints one line per finding (empty output = clean); the hook blocks on any output.
"""
import json, os, re, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def run(*cmd):
    return subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True).stdout


def protected_slugs():
    slugs = set()
    wdir = os.path.join(ROOT, '_writing')
    if os.path.isdir(wdir):
        for fn in os.listdir(wdir):
            if not fn.endswith('.md'):
                continue
            try:
                with open(os.path.join(wdir, fn), encoding='utf-8', errors='replace') as f:
                    head = f.read(2000)
            except OSError:
                continue
            m = re.match(r'^---\n(.*?)\n---', head, re.S)
            if m and re.search(r'^protected:\s*true\s*$', m.group(1), re.M):
                slugs.add(fn[:-3])
    return slugs


def private_assets():
    reg = os.path.join(ROOT, '_protect', 'registry.json')
    assets = set()
    try:
        with open(reg) as f:
            data = json.load(f)
        for e in data.get('posts', data).values():
            if isinstance(e, dict):
                assets.update(a.lstrip('/') for a in e.get('assets', []))
    except (OSError, ValueError):
        pass
    return assets


def main():
    staged = [f for f in run('git', 'diff', '--cached', '--name-only',
                             '--diff-filter=ACM').splitlines() if f]
    if not staged:
        return
    slugs = protected_slugs()
    assets = private_assets()

    if slugs and '_data/writing.yml' in staged:
        content = run('git', 'show', ':_data/writing.yml')
        for s in sorted(slugs):
            if f'/{s}/' in content:
                print(f'_data/writing.yml references protected post /{s}/')

    for f in staged:
        if f in assets:
            print(f'{f} is an asset of a protected post')


if __name__ == '__main__':
    main()
