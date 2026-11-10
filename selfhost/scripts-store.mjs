import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export function createScriptsStore(directory) {
  let queue = Promise.resolve();
  const file = directory && path.join(directory, 'scripts.json');
  async function read() {
    if (!file) throw Object.assign(new Error('稿件存储未配置，请按升级说明挂载数据目录。'), { status: 503 });
    try {
      const data = JSON.parse(await readFile(file, 'utf8'));
      if (!Array.isArray(data)) throw new Error('Invalid script store');
      return data;
    } catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  }
  function mutate(method, body) {
    const task = queue.then(async () => {
      const items = await read();
      const index = items.findIndex(item => item.id === body.id);
      if (method !== 'POST' && index < 0) throw Object.assign(new Error('稿件不存在，请刷新列表。'), { status: 404 });
      if (method !== 'POST' && body.revision !== items[index].revision) throw Object.assign(new Error('稿件已在其他设备修改，请刷新后重新编辑。当前编辑内容仍保留。'), { status: 409 });
      if (method === 'DELETE') items.splice(index, 1);
      else {
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 100 || typeof body.text !== 'string' || !body.text.trim() || body.text.length > 50000) throw Object.assign(new Error('标题限 100 字，正文限 50000 字，不能为空。'), { status: 400 });
        if (method === 'POST' && items.length >= 100) throw Object.assign(new Error('最多保存 100 份稿件，请先整理旧稿。'), { status: 400 });
        const item = { id: method === 'POST' ? randomUUID() : body.id, title: body.title.trim(), text: body.text, revision: randomUUID(), updatedAt: new Date().toISOString() };
        if (method === 'POST') items.unshift(item); else items[index] = item;
      }
      await mkdir(directory, { recursive: true });
      // Serialize writes and atomically replace the store to avoid partial files.
      const temporary = file + '.tmp';
      await writeFile(temporary, JSON.stringify(items), { mode: 0o600 });
      await rename(temporary, file);
      return items;
    });
    queue = task.catch(() => {});
    return task;
  }
  return { read, mutate };
}
