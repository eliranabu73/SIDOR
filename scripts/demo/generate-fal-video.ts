/**
 * Demo video generator using fal.ai
 *
 * Usage:
 *   1. Set FAL_KEY in .env.local (already done — gitignored)
 *   2. npx tsx scripts/demo/generate-fal-video.ts <scene-name>
 *
 * Scenes are predefined below. Each call produces one ~5-8 second clip.
 * After generating all scenes, stitch with ffmpeg:
 *   ffmpeg -f concat -safe 0 -i scenes.txt -c copy demo-video.mp4
 *
 * Model: fal-ai/kling-video/v1.5/standard/text-to-video (5s, ~$0.35/clip)
 * Alt: fal-ai/luma-dream-machine (slower, higher quality)
 *
 * Docs: https://fal.ai/models/fal-ai/kling-video
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const FAL_KEY = process.env['FAL_KEY'];
if (!FAL_KEY) {
  console.error('Missing FAL_KEY in .env.local');
  process.exit(1);
}

// All Hebrew + visual cues, 60-second total demo storyboard.
const SCENES: Record<string, { prompt: string; duration: 5 | 10; aspect: '16:9' | '9:16' }> = {
  intro: {
    prompt:
      'Cinematic close-up of a frustrated Israeli small-business owner ' +
      'looking at a messy paper schedule on a counter. Coffee cup, ' +
      'restaurant background, warm afternoon light. He sighs. ' +
      'Soft depth-of-field. Photorealistic.',
    duration: 5,
    aspect: '16:9',
  },
  laptop: {
    prompt:
      'Same business owner opens a clean modern web app on his laptop. ' +
      'Indigo and cyan gradient interface, Hebrew text visible on screen. ' +
      'Confident smile starting. Close-up over his shoulder. ' +
      'Photorealistic, modern office.',
    duration: 5,
    aspect: '16:9',
  },
  schedule: {
    prompt:
      'Beautiful animated schedule grid filling in automatically, ' +
      'employee photos and shift blocks sliding into place with smooth ' +
      'animation. Indigo to cyan gradient palette. Hebrew labels. ' +
      'Tech demo aesthetic, clean and confident.',
    duration: 5,
    aspect: '16:9',
  },
  whatsapp: {
    prompt:
      'A smartphone in a hand showing a WhatsApp message with a colorful ' +
      'schedule poster image. Notification badges popping up around the ' +
      'phone. Israeli context, modern minimal lighting. Photorealistic.',
    duration: 5,
    aspect: '16:9',
  },
  outro: {
    prompt:
      'Restaurant owner laughing with relaxed staff, all smiling and ' +
      'looking at a tablet together. Warm hopeful lighting, Hebrew ' +
      'storefront sign blurred in background. Photorealistic cinematic.',
    duration: 5,
    aspect: '16:9',
  },
};

async function submitJob(prompt: string, duration: number, aspect: string): Promise<string> {
  const res = await fetch(
    'https://queue.fal.run/fal-ai/kling-video/v1.5/standard/text-to-video',
    {
      method: 'POST',
      headers: {
        Authorization: `Key ${FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        duration: String(duration),
        aspect_ratio: aspect,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`FAL submit failed: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { request_id: string };
  return data.request_id;
}

async function pollJob(requestId: string): Promise<{ video: { url: string } }> {
  const url = `https://queue.fal.run/fal-ai/kling-video/requests/${requestId}`;
  for (let i = 0; i < 120; i++) {
    const res = await fetch(url, {
      headers: { Authorization: `Key ${FAL_KEY}` },
    });
    const data = (await res.json()) as {
      status: string;
      video?: { url: string };
    };
    if (data.status === 'COMPLETED' && data.video) return { video: data.video };
    if (data.status === 'FAILED') throw new Error('FAL job failed');
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error('FAL job timed out');
}

async function downloadTo(filePath: string, url: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(filePath, buf);
}

async function main(): Promise<void> {
  const sceneName = process.argv[2];
  if (!sceneName || !SCENES[sceneName]) {
    console.error('Available scenes:', Object.keys(SCENES).join(', '));
    console.error('Or pass "all" to generate every scene sequentially.');
    process.exit(1);
  }

  const outDir = path.join(process.cwd(), 'public', 'demo-clips');
  fs.mkdirSync(outDir, { recursive: true });

  const scenes = sceneName === 'all' ? Object.keys(SCENES) : [sceneName];
  for (const name of scenes) {
    const def = SCENES[name];
    if (!def) continue;
    console.log(`[${name}] submitting…`);
    const id = await submitJob(def.prompt, def.duration, def.aspect);
    console.log(`[${name}] request ${id} — polling`);
    const result = await pollJob(id);
    const file = path.join(outDir, `${name}.mp4`);
    await downloadTo(file, result.video.url);
    console.log(`[${name}] saved → ${file}`);
  }

  // Emit ffmpeg concat file
  const concat = scenes
    .map((s) => `file '${path.join(outDir, `${s}.mp4`)}'`)
    .join('\n');
  fs.writeFileSync(path.join(outDir, 'scenes.txt'), concat);
  console.log('\nStitch with:');
  console.log(
    `  ffmpeg -f concat -safe 0 -i ${path.join(outDir, 'scenes.txt')} -c copy ${path.join(outDir, 'demo-video.mp4')}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
