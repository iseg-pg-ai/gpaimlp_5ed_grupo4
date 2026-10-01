import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { projectRoot, catalogRoot } from '@/lib/catalog-store';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  if (request.headers.get('origin') && request.headers.get('origin') !== new URL(request.url).origin) return Response.json({ error: 'Origem inválida.' }, { status: 403 });
  const root = projectRoot();
  mkdirSync(catalogRoot(), { recursive: true });
  const lock = path.join(catalogRoot(), 'etl.lock');
  try { closeSync(openSync(lock, 'wx')); }
  catch { return Response.json({ error: 'Já existe uma atualização em curso. Aguarde a conclusão.' }, { status: 409 }); }
  try {
    const localPython = path.join(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
    const python = process.env.BLU_PYTHON ?? (existsSync(localPython) ? localPython : process.platform === 'win32' ? 'python' : 'python3');
    await promisify(execFile)(python, ['-B', '-m', 'etl.pipeline', '--data-dir', 'data', '--output-dir', 'warehouse'], { cwd: root, timeout: 180000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    return Response.json({ ok: true });
  } catch (e) {
    console.error('Catalog ETL failed', e);
    return Response.json({ error: 'O ETL não terminou. Verifique as dependências Python e os dados da fonte; consulte o terminal do servidor. As alterações continuam guardadas para nova tentativa.' }, { status: 503 });
  } finally { unlinkSync(lock); }
}
