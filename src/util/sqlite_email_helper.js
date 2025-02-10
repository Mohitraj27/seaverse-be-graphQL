const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('./emails.db', (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to SQLite database');
    }
});

db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS emails (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        temp_password TEXT NOT NULL,
        firstName TEXT NOT NULL,
        buttonLink TEXT NOT NULL,
        subject TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING'
      )
    `);
});

const insertEmails = (emailBatch) => {
    const stmt = db.prepare("INSERT INTO emails (email, temp_password, firstName, buttonLink, subject) VALUES (?, ?, ?, ?, ?)");
    const subject = 'Welcome to Seaverse!';
    emailBatch.forEach(({ email, temp_password, firstName, buttonLink }) => {
        stmt.run(email, temp_password, firstName, buttonLink, subject);
    });
    stmt.finalize();
};

const fetchEmailBatch = () => {
    return new Promise((resolve, reject) => {
        db.all(`SELECT * FROM emails LIMIT 50`, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
};

const deleteEmailBatch = (ids) => {
    return new Promise((resolve, reject) => {
        const placeholders = ids.map(() => '?').join(',');
        db.run(`DELETE FROM emails WHERE id IN (${placeholders})`, ids, (err) => {
            if (err) reject(err);
            else resolve(true);
        });
    });
};

// const getPendingEmails = () => {
//     return new Promise((resolve, reject) => {
//         db.all(`SELECT * FROM emails WHERE status = 'PENDING'`, (err, rows) => {
//             if (err) reject(err);
//             else resolve(rows);
//         });
//     });
// };

// const updateEmailStatus = (id, status) => {
//     return new Promise((resolve, reject) => {
//         db.run(
//             `UPDATE emails SET status = ? WHERE id = ?`,
//             [status, id],
//             function (err) {
//                 if (err) reject(err);
//                 else resolve(true);
//             }
//         );
//     });
// };

module.exports = { insertEmails, fetchEmailBatch, deleteEmailBatch };