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
    db.run(`
        CREATE TABLE IF NOT EXISTS course_emails (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL,
          subject TEXT NOT NULL DEFAULT 'Course Enrollment',
          firstName TEXT NOT NULL,
          courses TEXT NOT NULL ,
          isAdmin INTEGER NOT NULL default 0, 
          action TEXT NOT NULL DEFAULT 'ENROLL',
          status TEXT DEFAULT 'PENDING'
        )
    `);
});

//welcome emails crud to sqlite
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


//course enrollment emails crud to sqlite
const insertCourseEmails = (emailBatch) => {
    const stmt = db.prepare(
      "INSERT INTO course_emails (email, subject, firstName, courses, isAdmin, action) VALUES (?, ?, ?, ?, ?, ?)"
    );
    emailBatch.forEach(email => {
      const coursesJson = JSON.stringify(email.courses);
      const isAdmin = email.isAdmin ? 1 : 0;
      const action = email.action || 'ENROLL';
      const subject = email.subject || 'Course Enrollment';
      const firstName = email.firstName || 'User';
  
      stmt.run(email.receiverEmail, subject, firstName, coursesJson, isAdmin, action);
    });
    stmt.finalize();
  };

const fetchCourseEmailBatch = (action = null) => {
    console.log(action);
    switch (action) {
        case 'ENROLL':
            console.log('fetching enroll');
            return new Promise((resolve, reject) => {
                db.all(`SELECT * FROM course_emails WHERE action = 'ENROLL' LIMIT 50`, (err, rows) => resolve(err ? reject(err) : rows));
            });
        case 'UNENROLL':
            console.log('fetching unenroll');
            return new Promise((resolve, reject) => {
                db.all(`SELECT * FROM course_emails WHERE action = 'UNENROLL' LIMIT 50`, (err, rows) => resolve(err ? reject(err) : rows));
            });
        default:
            console.log('fetching all');
            return new Promise((resolve, reject) => {
                db.all(`SELECT * FROM course_emails LIMIT 50`, (err, rows) => resolve(err ? reject(err) : rows));
            });
    }
};
  
  const deleteCourseEmailBatch = (ids) => {
    return new Promise((resolve, reject) => {
      const placeholders = ids.map(() => '?').join(',');
      db.run(`DELETE FROM course_emails WHERE id IN (${placeholders})`, ids, (err) => {
        resolve(err ? reject(err) : true);
      });
    });
  };


module.exports = {
    insertEmails,
    fetchEmailBatch,
    deleteEmailBatch,
    insertCourseEmails,
    fetchCourseEmailBatch,
    deleteCourseEmailBatch
};