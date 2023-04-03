const crypto = require("node:crypto");

const getSchedules = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.status(401).end();
    }

    const year = req.query.term.slice(0, -1);
    const semester = req.query.term.slice(-1);
    const DB = req.app.locals.database;
    const classes = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, co.title AS course, b.year, b.block_no FROM Terms t INNER JOIN Schedules sc ON ` +
        `t.id = sc.term_id INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Courses co ON ` +
        `b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id INNER JOIN Subjects s ON ` +
        `sc.subj_id = s.id WHERE t.year = ${year} AND t.term = '${semester}' AND sc.faculty_id IS NULL ` +
        `AND d.chair_id = '${user.id}' ORDER BY b.year, subject, b.block_no;` +
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, co.title AS course, b.year, b.block_no FROM Terms t INNER JOIN Schedules sc ON ` +
        `t.id = sc.term_id INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Courses co ON ` +
        `b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id INNER JOIN Subjects s ON ` +
        `sc.subj_id = s.id WHERE t.year = ${year} AND t.term = '${semester}' AND sc.faculty_id IS NULL ` +
        `AND NOT d.chair_id = '${user.id}' ORDER BY b.year, subject, b.block_no;`
    );

    req.deptClasses = classes[0];
    console.log(classes[1]);
    req.otherClasses = classes[1];
    next();
}

module.exports = { getSchedules };