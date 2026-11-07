# Demo video assets

`how_it_works.py` is the "how it works" animation for the demo video (DEMO.md §2). It runs about 52 seconds in four
parts (the signature, the account, the keys, the name), each held for `PART_SECONDS` so the voiceover fits. Change
those numbers to match your recording, and re-render.

```sh
python -m venv .venv && .venv/Scripts/pip install manim==0.22.1    # macOS/Linux: .venv/bin/pip
.venv/Scripts/manim -qh --media_dir video/media video/how_it_works.py HowItWorks   # 1080p60
```

The output is `video/media/videos/how_it_works/1080p60/HowItWorks.mp4`. Use `-ql` for a quick preview. The fonts are
Inter and Cascadia Mono; if they're missing, Pango falls back to a default font.
