const getSchedules = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.status(401).redirect("/login");
    }

    const termID = req.query.term || req.body.term;
    const DB = req.app.locals.database;
    const [{ year, term }] = await DB.executeQuery(`SELECT year, term FROM Terms WHERE id = '${termID}' LIMIT 1`);
    if (!year || !term) {
        return res.status(409).redirect("/login");
    }

    req.term = {
        title: `${(term == 's') ? 'Summer' : toOrdinal(term)} Semester, ${year} - ${parseInt(year) + 1}`,
        id: termID
    }
    req.data = {};
    if (req.params.category != "faculty") {
        return next();
        // const block = await DB.executeQuery(
        //     `SELECT f.id, f.faculty_id, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
        //     `f.status, p.status AS pref_status, CONCAT(p.assigned_load, " / ", f.teach_load) AS teach_load FROM ` +
        //     `Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON p.faculty_id = f.id ` +
        //     `INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' AND t.id = '${termID}' ` +
        //     `ORDER BY f.status, name`
        // );
    }
    
    const faculty = await DB.executeQuery(
        `SELECT f.id, f.faculty_id, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
        `f.status, p.status AS pref_status, CONCAT(p.assigned_load, " / ", f.teach_load) AS teach_load FROM ` +
        `Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON p.faculty_id = f.id ` +
        `INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' AND t.id = '${termID}' ` +
        `ORDER BY f.status, name`
    );

    const current = faculty.findIndex((value) => value.id === req.query.id);
    req.data.prevFaculty = faculty[current - 1] || null;
    req.data.nextFaculty = faculty[current + 1] || null;

    req.data.current = faculty[current];
    const assignedClasses = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, s.units, co.title AS course, b.year, b.block_no, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) ` +
        `AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, sc.day, sc.mode, r.name AS room ` +
        `FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Courses co ON ` +
        `b.course_id = co.id INNER JOIN Departments d ON co.dept_id = d.id LEFT JOIN Subjects s ON ` +
        `sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id WHERE sc.term_id = '${termID}' AND ` +
        `sc.faculty_id = '${faculty[current].id}' AND d.chair_id = '${user.id}' ORDER BY sc.day, sc.start`
    );

    req.data.current.classes = assignedClasses;

    const [deptClasses, otherClasses] = await DB.executeQuery(
        `SELECT DISTINCT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title ` +
        `END AS subject, TRUNCATE(SUM(sc.end - sc.start)/60, 1) AS assigned_time, s.req_hours, co.title AS course, s.id, ` +
        `sc.block_id, b.year, b.block_no FROM Terms t INNER JOIN Schedules sc ON t.id = sc.term_id INNER JOIN Blocks b ` +
        `ON sc.block_id = b.id INNER JOIN Courses co ON b.course_id = co.id INNER JOIN Departments d ` +
        `ON co.dept_id = d.id INNER JOIN Subjects s ON sc.subj_id = s.id WHERE t.id = '${termID}' AND ` +
        `(sc.faculty_id IS NULL OR sc.faculty_id = '${faculty[current]["id"]}') AND d.chair_id = '${user.id}' ` +
        `GROUP BY sc.block_id, sc.subj_id ORDER BY b.year, b.block_no, subject;` +

        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, TRUNCATE(SUM(sc.end - sc.start)/60, 1) AS assigned_time, s.req_hours, co.title AS course, ` +
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
    next();
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

const initSchedGen = async (req, res, next) => {
    if (!req.account) {
        return res.status(401).end();
    }

    const DB = req.app.locals.database;
    const {termID} = req.body;

    // get department's faculty
    const [faculty] = await DB.executeQuery(
        `SELECT p.faculty_id as id, p.id as pref_id, f.teach_load FROM Preferences p INNER JOIN Faculty f ON p.faculty_id = f.id ` +
        `WHERE p.term_id = '${termID}' ORDER BY f.status DESC;` +
        `UPDATE Preferences SET assigned_load = 0 WHERE term_id = '${termID}';`
    );

    // get classes of blocks under the department
    let classes = await DB.executeQuery(
        `select sc.block_id, sc.subj_id, s.units, s.req_hours FROM Schedules sc INNER JOIN Blocks b on ` +
        `sc.block_id = b.id LEFT JOIN Courses co ON b.course_id = co.id INNER JOIN Subjects s ON ` +
        `sc.subj_id = s.id INNER JOIN Curricula cu ON sc.subj_id = cu.subj_id AND s.id = cu.subj_id ` +
        `LEFT JOIN Departments d ON co.dept_id = d.id where d.chair_id = '${req.account.id}' ORDER BY s.units`
    );

    // faculty loading
    for (let prof of faculty) {
        let { id, pref_id, teach_load } = prof;

        // check for preferred subjects to load
        let availClasses = classes.slice(0);
        const subjects = await DB.executeQuery(`SELECT subj_id FROM PrefSubjects WHERE pref_id = '${pref_id}'`);
        // sorts the classes according to preferred subjects
        if (subjects.length > 0) {
            availClasses.sort((a, b) => !a.prof && !b.prof && subjects.includes(b.subject) - subjects.includes(a.subject) || b.units - a.units);
        } else {
            availClasses.sort((a, b) => !a.prof && !b.prof);
        }

        // assign classes until faculty load is full
        for (let c of availClasses) {
            if (!c.prof && c.units <= teach_load) {
                c.prof = id;
                // c.teach_load = prof.teach_load;
                teach_load -= c.units;
            }
            if (teach_load == 0) {
                break;
            }
        }
        classes = availClasses;
    }

    // remove classes that couldn't be assigned to a faculty
    classes = classes.filter(val => val.prof);
    // sort classes according to subjects in ascending order
    classes.sort((a, b) => a.subj_id.localeCompare(b.subj_id));
    
    // compute the total hours all faculty need to teach
    const totalHours = classes.reduce((acc, val) => acc + val.req_hours, 0);
    // assuming that rooms are available 15 hours a day, 7 days a week
    // get the number of rooms enough for all class hours
    const totalRooms = Math.ceil(totalHours / (15 * 7));
    // get any room that has not been used in existing schedules
    let rooms = await DB.executeQuery(
        `SELECT DISTINCT r.id FROM Terms t LEFT JOIN Buildings bu ON t.school_id = bu.school_id INNER JOIN ` +
        `Rooms r ON bu.id = r.bldg_id LEFT JOIN Schedules sc ON r.id = sc.room_id WHERE ` +
        `t.id = '${termID}' AND sc.day IS NULL AND sc.start IS NULL AND sc.end IS NULL LIMIT 3;`
    );

    rooms = rooms.map((room) => ({...room, slots: new Array(15 * 7)}));

    let room = 0;
    let time = 0;
    let day = 0;

    let totalIterations = 0;
    let conflicts = 0;
    let limit = classes.length * 2;

    while (classes.length > 0 && conflicts < limit) {
        // totalIterations++;
        //get first class in the queue
        const { block_id, prof, req_hours, subj_id, units } = classes[0];
        if (time + req_hours >= 15 && room + 1 >= totalRooms) {
            time = 0;
            room = 0;
            day++;
            continue;
        } else if (time + req_hours >= 15) {
            time = 0;
            room++;
            continue;
        }
        
        let startTime = time + day * 15;
        let endTime = startTime + req_hours;
        const slot = rooms.reduce((acc, r) => acc.concat(r.slots.slice(startTime, endTime)), []);
        if (slot.some((c) => c.block_id == block_id || c.prof == prof)) {
            let preempt = classes.shift();
            classes.push(preempt);
            conflicts++;
            continue;
        }
        
        rooms[room].slots.fill({block_id: block_id, prof: prof}, startTime, endTime);
        await DB.executeQuery(
            `UPDATE Preferences SET assigned_load = assigned_load + ${units} WHERE faculty_id = '${prof}' AND ` +
            `term_id = '${termID}' LIMIT 1;` +
            `UPDATE Schedules SET day = ${day + 1}, start = ${(time + 8) * 60}, end = ${(time + req_hours + 8) * 60}, ` +
            `faculty_id = '${prof}', mode = 1, room_id = '${rooms[room].id}' WHERE block_id = '${block_id}' ` +
            `AND subj_id = '${subj_id}' AND term_id = '${termID}' LIMIT 1;`
        );
        classes.shift();
        time += req_hours;
    }
    rooms.map(({slots}, i) => {
        console.log(`\nRoom #${i+1}`);
        while (slots.length) {
            console.table(slots.splice(0, 15));
        }
    });
    console.log(totalIterations, classes.length, conflicts);
    
    next();
}

module.exports = { getSchedules, initSchedGen };