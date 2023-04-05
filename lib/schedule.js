const crypto = require("node:crypto");

const getSchedules = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.status(401).redirect("/login");
    }
    
    const termID = req.query.term;
    const DB = req.app.locals.database;
    const [term] = await DB.executeQuery(`SELECT year, term FROM Terms WHERE id = '${termID}' LIMIT 1`);

    if (!term) {
        return res.status(409).redirect("/login");
    }

    req.data = {};
    if (req.params.category == "faculty") {
        const faculty = await DB.executeQuery(
            `SELECT f.id, f.faculty_id, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
            `f.status, p.teach_load FROM Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON ` +
            `p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' ` +
            `AND t.id = '${termID}' ORDER BY f.status, name`
        );
        
        const current = faculty.findIndex((value) => value.faculty_id === req.query.id);
        req.data.prevFaculty = faculty[current-1] || null;
        req.data.nextFaculty = faculty[current+1] || null;

        req.data.current = faculty[current];
        const assignedClasses = await DB.executeQuery(
            `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
            `AS subject, s.units, co.title AS course, b.year, b.block_no, sc.day, (sc.start DIV 60 - 7) * 2 + 1 ` +
            `AS start, (sc.end DIV 60 - 7) * 2 + 1 AS end FROM Terms t ` +
            `INNER JOIN Schedules sc ON t.id = sc.term_id INNER JOIN Blocks b ON sc.block_id = b.id ` +
            `INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id ` +
            `INNER JOIN Subjects s ON sc.subj_id = s.id WHERE t.id = '${termID}' AND ` +
            `sc.faculty_id = '${faculty[current]["id"]}' AND d.chair_id = '${user.id}' ORDER BY sc.day, sc.start`
        );
        
        if (assignedClasses.length > 0) {
            req.data.current.total_load = assignedClasses.reduce((sum, value) => {
                return sum + value.units;
            }, 0);
        } else {
            req.data.current.total_load = 0
        }
        req.data.current.classes = assignedClasses;

        const [deptClasses, otherClasses] = await DB.executeQuery(
            `SELECT DISTINCT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title ` +
            `END AS subject, SUM(sc.end - sc.start)/60 AS assigned_time, s.req_hours, co.title AS course, ` +
            `sc.block_id, b.year, b.block_no FROM Terms t INNER JOIN Schedules sc ON t.id = sc.term_id INNER JOIN Blocks b ` +
            `ON sc.block_id = b.id INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ` +
            `ON co.dept_id = d.id INNER JOIN Subjects s ON sc.subj_id = s.id WHERE t.id = '${termID}' AND ` +
            `(sc.faculty_id IS NULL OR sc.faculty_id = '${faculty[current]["id"]}') AND d.chair_id = '${user.id}' ` +
            `GROUP BY sc.block_id, sc.subj_id ORDER BY b.year, b.block_no, subject;` +

            `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
            `AS subject, SUM(sc.end - sc.start)/60 AS assigned_time, s.req_hours, co.title AS course, ` +
            `b.year, b.block_no FROM Terms t INNER JOIN Schedules sc ON t.id = sc.term_id INNER JOIN Blocks b ON ` +
            `sc.block_id = b.id INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ON ` +
            `co.dept_id = d.id INNER JOIN Subjects s ON sc.subj_id = s.id WHERE t.id = '${termID}' AND ` +
            `sc.faculty_id IS NULL AND NOT d.chair_id = '${user.id}' GROUP BY sc.block_id, sc.subj_id ` +
            `ORDER BY b.year, b.block_no, subject;`
        );

        req.data.deptClasses = deptClasses.filter((val) => {
            return val.assigned_time < val.req_hours;
        });
        
        req.data.otherClasses = otherClasses.filter((val) => {
            return val.assigned_time < val.req_hours;
        });

        const [currentTerm] = await DB.executeQuery(`SELECT year, term FROM Terms WHERE id = '${termID}' LIMIT 1`);
        const {year, term} = currentTerm;
        req.term = {
            title: `${(term == 's') ? 'Summer' : toOrdinal(term)} Semester, ${year} - ${parseInt(year)+1}`,
            id: termID
        }
        return next();
    }

}

function toOrdinal(number) {
    if (number == 1) {
        return number + "<sup>st</sup>";
    } else if (number == 2) {
        return number + "<sup>nd</sup>";
    } else if (number == 3) {
        return number + "<sup>rd</sup>";
    } else if (number > 3) {
        return number + "<sup>th</sup>";
    } else {
        return number;
    }
}

module.exports = { getSchedules };