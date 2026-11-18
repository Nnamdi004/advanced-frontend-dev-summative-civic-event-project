import db from '../config/db.js';

/**
 * Create a new notification
 * @param {Object} param0
 * @param {string} param0.title
 * @param {string} param0.message
 * @param {string} param0.type
 * @param {string|null} param0.recipient_id
 * @param {Object} param0.metadata
 * @param {string|null} param0.created_by
 * @returns {Object} created notification
 */
export const create = async ({ title, message, type, recipient_id = null, metadata = {}, created_by = null }) => {
    const res = await db.query(
        `INSERT INTO notifications (title, message, type, recipient_id, metadata, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [title, message, type, recipient_id, metadata, created_by]
    );
    return res.rows[0];
};

/**
 * List notifications for a user
 * @param {string|null} userId - if null, return all broadcast notifications
 * @returns {Array}
 */
export const findAllForUser = async (userId = null) => {
    const res = await db.query(
        `SELECT n.*,
                (n.read OR user_reads.notification_id IS NOT NULL) AS read
         FROM notifications n
         LEFT JOIN user_notification_reads user_reads
           ON user_reads.notification_id = n.id AND user_reads.user_id = $1
         WHERE n.recipient_id IS NULL OR n.recipient_id = $1
         ORDER BY n.created_at DESC`,
        [userId]
    );
    return res.rows;
};

export const findByIdForUser = async (id, userId) => {
    const res = await db.query(
        `SELECT n.*,
                (n.read OR user_reads.notification_id IS NOT NULL) AS read
         FROM notifications n
         LEFT JOIN user_notification_reads user_reads
           ON user_reads.notification_id = n.id AND user_reads.user_id = $2
         WHERE n.id = $1 AND (n.recipient_id IS NULL OR n.recipient_id = $2)`,
        [id, userId]
    );
    return res.rows[0] || null;
};

export const markAsRead = async (id, userId) => {
    await db.query(
        `INSERT INTO user_notification_reads (notification_id, user_id)
         SELECT id, $2
         FROM notifications
         WHERE id = $1 AND (recipient_id IS NULL OR recipient_id = $2)
         ON CONFLICT (notification_id, user_id) DO NOTHING`,
        [id, userId]
    );
    return findByIdForUser(id, userId);
};

/**
 * Delete a notification
 * @param {string} id
 */
export const remove = async (id) => {
    await db.query('DELETE FROM notifications WHERE id=$1', [id]);
};

/**
 * Find a notification by ID
 * @param {string} id - UUID of the notification
 * @returns {Object|null} Notification object if found, otherwise null
 */
export const findById = async (id) => {
    const res = await db.query('SELECT * FROM notifications WHERE id=$1', [id]);
    return res.rows[0] || null;
};
