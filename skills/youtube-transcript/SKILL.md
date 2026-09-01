---
name: youtube-transcript
description: "Fetch YouTube video transcripts (captions) by URL or video ID for summarization/analysis. Use when the user shares a YouTube link and asks to summarize, quote, or analyze the video content."
disable-model-invocation: true
---

# YouTube Transcript

Fetch transcripts from YouTube videos.

## Setup

```bash
cd {baseDir}
npm install
```

## Usage

```bash
{baseDir}/transcript.js <video-id-or-url>
```

Accepts video ID or full URL:
- `EBw7gsDPAYQ`
- `https://www.youtube.com/watch?v=EBw7gsDPAYQ`
- `https://youtu.be/EBw7gsDPAYQ`

## Output

Timestamped transcript entries:

```
[0:00] All right. So, I got this UniFi Theta
[0:15] I took the camera out, painted it
[1:23] And here's the final result
```

## Notes

- Requires the video to have captions/transcripts available
- Works with auto-generated and manual transcripts
