import type { VercelRequest, VercelResponse } from 'vercel';

// Hard safety: optionally restrict to one bucket
const ALLOWED_BUCKET = process.env.ALLOWED_BUCKET || 'audio-uploads';

export default async function handler(req: VercelRequest, res: VercelResponse) {
    try {
        // Only allow PUT (raw binary upload)
        if (req.method !== 'PUT') {
            return res.status(405).json({ error: 'Method Not Allowed' });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL; // e.g. https://xxxxxxxx.supabase.co
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY; // service role ONLY on server
        if (!SUPABASE_URL || !SERVICE_KEY) {
            return res.status(500).json({ error: 'Server not configured' });
        }

        // Extract `/storage/v1/object/<bucket>/<filename...>`
        const path = (req.query.path as string[] | undefined) || [];
        const joined = path.join('/'); // storage/v1/object/<bucket>/<filename...>
        const parts = joined.split('/');
        // parts[0]=storage, [1]=v1, [2]=object, [3]=bucket, [4..]=filename segments
        const bucket = parts[3];
        const filename = parts.slice(4).join('/');

        if (!bucket || !filename) {
            return res.status(400).json({ error: 'Missing bucket or filename' });
        }
        if (ALLOWED_BUCKET && bucket !== ALLOWED_BUCKET) {
            return res.status(403).json({ error: 'Bucket not allowed' });
        }

        // Pass through content-type
        const contentType = req.headers['content-type'] || 'application/octet-stream';

        // Read raw body
        const chunks: Uint8Array[] = [];
        await new Promise<void>((resolve, reject) => {
            req.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
            req.on('end', () => resolve());
            req.on('error', reject);
        });
        const body = Buffer.concat(chunks);

        const target = `${SUPABASE_URL}/storage/v1/object/${bucket}/${encodeURI(filename)}`;

        const f = await fetch(target, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': contentType as string,
                // you can add 'x-upsert': 'true' if you want overwrite behavior:
                // 'x-upsert': 'true'
            },
            body
        });

        const text = await f.text(); // Supabase may return empty body
        res.status(f.status).send(text || '');
    } catch (e: any) {
        res.status(500).json({ error: e?.message || 'Proxy error' });
    }
}