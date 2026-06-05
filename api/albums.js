import { query, transaction, checkAdmin, setCors } from './_db.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const result = await query(
        `SELECT id, date, title, description, image_url, view_count, created_at
         FROM albums
         ORDER BY date DESC, id DESC`
      );
      return res.status(200).json(result.rows);
    }

    if (!checkAdmin(req)) {
      return res.status(401).json({ error: '인증 실패' });
    }

    if (req.method === 'POST') {
      const { date, title, description, image_url } = req.body || {};
      if (!date || !title || !image_url) {
        return res.status(400).json({ error: '날짜, 제목, 이미지 URL은 필수입니다' });
      }
      const newId = await transaction(async (client) => {
        const inserted = await client.query(
          `INSERT INTO albums (date, title, description, image_url)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [date, title, description || null, image_url]
        );
        const id = inserted.rows[0].id;
        await client.query(
          `INSERT INTO audit_log (table_name, record_id, action) VALUES ($1, $2, 'INSERT')`,
          ['albums', id]
        );
        return id;
      });
      return res.status(201).json({ id: newId });
    }

    if (req.method === 'PUT') {
      const id = parseInt(req.query.id, 10);
      const { date, title, description, image_url } = req.body || {};
      if (!id || !date || !title || !image_url) {
        return res.status(400).json({ error: 'id, 날짜, 제목, 이미지 URL은 필수입니다' });
      }
      await transaction(async (client) => {
        const updated = await client.query(
          `UPDATE albums SET date=$1, title=$2, description=$3, image_url=$4 WHERE id=$5`,
          [date, title, description || null, image_url, id]
        );
        if (updated.rowCount === 0) throw new Error('해당 앨범을 찾을 수 없습니다');
        await client.query(
          `INSERT INTO audit_log (table_name, record_id, action) VALUES ($1, $2, 'UPDATE')`,
          ['albums', id]
        );
      });
      return res.status(200).json({ success: true });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(req.query.id, 10);
      if (!id) return res.status(400).json({ error: 'id가 필요합니다' });
      await transaction(async (client) => {
        const deleted = await client.query(`DELETE FROM albums WHERE id=$1`, [id]);
        if (deleted.rowCount === 0) throw new Error('해당 앨범을 찾을 수 없습니다');
        await client.query(
          `INSERT INTO audit_log (table_name, record_id, action) VALUES ($1, $2, 'DELETE')`,
          ['albums', id]
        );
      });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[albums]', err);
    return res.status(500).json({ error: err.message });
  }
}
