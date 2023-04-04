const crypto = require("node:crypto");

const getSchedules = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.status(401).redirect("/login");
    }
    
    const year = req.query.term.slice(0, -1);
    const semester = req.query.term.slice(-1);
    const DB = req.app.locals.database;
    req.data = {};
    if (req.params.category == "faculty") {
        const faculty = await DB.executeQuery(
            `SELECT f.id, f.faculty_id, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
            `f.status, p.teach_load FROM Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON ` +
            `p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' ` +
            `AND t.year = ${year} AND t.term = '${semester}' ORDER BY f.status, name`
        );
        
        const current = faculty.findIndex((value) => value.faculty_id === req.query.id);
        req.data.prevFaculty = faculty[current-1] || null;
        req.data.nextFaculty = faculty[current+1] || null;

        req.data.current = faculty[current];
        const assignedClasses = await DB.executeQuery(
            `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
            `AS subject, s.units, co.title AS course, b.year, b.block_no, sc.day, sc.start, sc.end FROM Terms t ` +
            `INNER JOIN Schedules sc ON t.id = sc.term_id INNER JOIN Blocks b ON sc.block_id = b.id ` +
            `INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id ` +
            `INNER JOIN Subjects s ON sc.subj_id = s.id WHERE t.year = ${year} AND t.term = '${semester}' AND ` +
            `sc.faculty_id = '${faculty[current]}' AND d.chair_id = '${user.id}' ORDER BY sc.day, sc.start`
        );
        if (assignedClasses.length > 0) {
            req.data.current.total_load = assignedClasses.reduce((prev, value) => {
                return prev.units + value.units;
            });
        } else {
            req.data.current.total_load = 0
        }
        req.data.current.classes = assignedClasses;

        const classes = await DB.executeQuery(
            `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
            `AS subject, co.title AS course, b.year, b.block_no FROM Terms t INNER JOIN Schedules sc ON ` +
            `t.id = sc.term_id INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Courses co ON ` +
            `b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id INNER JOIN Subjects s ON ` +
            `sc.subj_id = s.id WHERE t.year = ${year} AND t.term = '${semester}' AND sc.faculty_id IS NULL ` +
            `AND d.chair_id = '${user.id}' ORDER BY b.year, b.block_no, subject;` +
            `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
            `AS subject, co.title AS course, b.year, b.block_no FROM Terms t INNER JOIN Schedules sc ON ` +
            `t.id = sc.term_id INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Courses co ON ` +
            `b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id INNER JOIN Subjects s ON ` +
            `sc.subj_id = s.id WHERE t.year = ${year} AND t.term = '${semester}' AND sc.faculty_id IS NULL ` +
            `AND NOT d.chair_id = '${user.id}' ORDER BY b.year, b.block_no, subject;`
        );

        req.data.deptClasses = classes[0];
        req.data.otherClasses = classes[1];
        return next();
    }

}

module.exports = { getSchedules };