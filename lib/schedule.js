const { FacultyLoading, scheduleClasses } = require("./genetic-timetable");

function initRooms(rooms) {
    const assignRooms = [];
    let slots = [];
    let roomID = rooms[0].id;
    let roomName = rooms[0].name;
    for (let i = 0; i < rooms.length; i++) {
        const { id, name, prof, day } = rooms[i];

        if (roomID != id || i + 1 == rooms.length) {
            assignRooms.push({ id: roomID, name: roomName, slots: slots.splice(0, slots.length) });
            roomID = id;
            roomName = name;
        }

        if (prof && day) {
            delete rooms[i].id;
            delete rooms[i].name;
            slots.push(rooms[i]);
        }
    }

    return assignRooms;
}

const generateSchedule = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.status(401).redirect('/logout');
    }

    const DB = req.app.locals.database;
    const termCode = req.query.term || req.body.term || "";
    const [currentTerm] = await DB.executeQuery(
        `SELECT t.id AS termID FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${user.id}' AND ` +
        `CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );
    if (!currentTerm) {
        return res.status(409).redirect("back");
    }
    const { termID } = currentTerm;
    req.termID = termID;

    let classes = await DB.executeQuery(
        `SELECT sc.block_id AS block, sc.subj_id AS subj, s.units, s.req_hours AS hours, s.pref_rooms AS ` +
        `prefRooms FROM Schedules sc INNER JOIN Blocks b on sc.block_id = b.id LEFT JOIN Courses co ON ` +
        `b.course_id = co.id INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Curricula cu ON ` +
        `sc.subj_id = cu.subj_id AND s.id = cu.subj_id LEFT JOIN Departments d ON co.dept_id = d.id WHERE ` +
        `sc.term_id = '${termID}' AND sc.faculty_id IS NULL AND d.chair_id = '${user.id}'`
    );
    classes = classes.map(c => ({ ...c, prefRooms: c.prefRooms.split(",") }));
    
    let faculty = await DB.executeQuery(
        `SELECT p.faculty_id as id, p.id AS pref_id, (f.teach_load - p.assigned_load) AS teach_load FROM Preferences p ` +
        `INNER JOIN Faculty f ON p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id WHERE ` +
        `(f.teach_load - p.assigned_load) > 0 AND p.term_id = '${termID}' AND d.chair_id = '${user.id}' ` +
        `ORDER BY f.status DESC`
    );
    
    console.log(classes.length, faculty.length);
    if (classes.length <= 0 || faculty.length <= 0) {
        return res.status(200).send(
            `There are no more blank classes to assign or all faculty are fully loaded.<br>` +
            `Go back to <a href="/chair/schedules?term=${termCode}">Schedules Tab</a>`
        );
    }

    console.log("Generating department schedule for term, " + termCode + "...");
    console.time("Genetic Faculty Loading execution time");
    const assignClasses = [];
    for (const prof of faculty) {
        let { id, teach_load, pref_id } = prof;
        if (classes.length <= 0) {
            break;
        }

        let subjects = await DB.executeQuery(
            `SELECT DISTINCT subj_id FROM PrefSubjects WHERE pref_id = '${pref_id}'`
        );

        const facultyLoader = new FacultyLoading(teach_load, 50, subjects.map(({ subj_id }) => subj_id), classes, 20);
        const optimalLoad = facultyLoader.evolve(5);

        prof.assign_load = optimalLoad.totalUnits;
        prof.pref_subjs = subjects;

        assignClasses.push(...optimalLoad.classes.map(c => ({ ...c, prof: id })));
        classes = classes.filter(c => !optimalLoad.classes.some(oc => oc.block == c.block && oc.subj == c.subj));
    }
    console.timeEnd("Genetic Faculty Loading execution time");
    console.log("\nFaculty loaded classes:");
    console.table(assignClasses);
    console.log("\nUnassigned classes:");
    console.table(classes);

    console.log("\nDepartmental Faculty Information:");
    console.table(faculty);

    classes = undefined;
    const rooms = initRooms(await DB.executeQuery(
        `SELECT r.id, r.name, sc.block_id AS block, sc.subj_id AS subj, s.units, sc.faculty_id AS prof, sc.day, ` +
        `sc.start, sc.end FROM Terms t LEFT JOIN Buildings bu ON t.school_id = bu.school_id INNER JOIN Rooms r ON ` +
        `bu.id = r.bldg_id LEFT JOIN Schedules sc ON t.id = sc.term_id AND r.id = sc.room_id LEFT JOIN ` +
        `Subjects s ON sc.subj_id = s.id WHERE t.id = '${termID}' ORDER BY r.name, sc.block_id, sc.day, sc.start`
    ));

    console.log("\nList of rooms and availability:");
    console.table(rooms);

    console.time("\nIterative classroom scheduling exec. time");
    const classSchedule = scheduleClasses(assignClasses, rooms, 7, 15, 7, 2);
    console.timeEnd("\nIterative classroom scheduling exec. time");

    for (const classroom of classSchedule) {
        const { id, name, slots } = classroom;
        if (slots.length <= 0) {
            continue;
        }

        console.log("\n" + name);
        console.table(slots);

        const { firstClass, partialClass } = slots.reduce((arr, c) => {
            arr[(c.partial === undefined || c.partial) ? "partialClass" : "firstClass"].push(c);
            return arr;
        }, { firstClass: [], partialClass: [] });

        let query = "";
        if (firstClass.length > 0) {
            query += firstClass.reduce((q, { block, subj, units, prof, day, start, end }) => {
                return q += `UPDATE Schedules SET faculty_id = '${prof}', day = ${day}, start = ${start}, ` +
                    `end = ${end}, room_id = '${id}', mode = 1 WHERE term_id = '${termID}' AND ` +
                    `block_id = '${block}' AND subj_id = '${subj}' LIMIT 1; ` +
                    `UPDATE Preferences SET assigned_load = assigned_load + ${units || 0} ` +
                    `WHERE term_id = '${termID}' AND faculty_id = '${prof}' LIMIT 1;`;
            }, "");
        }

        if (partialClass.length > 0) {
            query += `\nINSERT INTO Schedules VALUES (${partialClass.map(({ block, subj, prof, day, start, end }) => {
                return `'${termID}', '${subj}', '${block}', '${prof}', '${id}', ${day}, ${start}, ${end}, 1`
            }).join("), (")});`;
        }
        
        DB.executeQuery(query).then(null, (error) => {
            if (error) {
                return res.status(501).redirect("/schedule/failed/" + termCode);
            }
        });
    }

    console.log("Successfully generated department schedule for term, " + termCode + " <3");

    next();
}

const getFacultySched = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.status(401).redirect("/login");
    }

    const termCode = req.query.term || req.body.term || "";
    const DB = req.app.locals.database;
    const [currentTerm] = await DB.executeQuery(
        `SELECT t.id AS termID, t.year, t.term FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${user.id}' AND ` +
        `CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );
    if (!currentTerm) {
        return res.status(409).redirect("/chair/schedules");
    }

    const { termID, year, term } = currentTerm;
    req.term = {
        title: `${(term == 's') ? 'Summer' : toOrdinal(term)} Semester, ${year} - ${parseInt(year) + 1}`,
        code: termCode,
        id: termID
    }
    req.data = {};
    const faculty = await DB.executeQuery(
        `SELECT f.id, f.faculty_id, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
        `f.status, p.status AS pref_status, CONCAT(p.assigned_load, " / ", f.teach_load) AS teach_load FROM ` +
        `Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON p.faculty_id = f.id ` +
        `INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' AND t.id = '${termID}' ` +
        `ORDER BY f.status, name`
    );

    const current = faculty.findIndex((value) => value.faculty_id === req.query.id);
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
        `(sc.faculty_id IS NULL OR sc.faculty_id = '${faculty[current].id}') AND d.chair_id = '${user.id}' ` +
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
};

const getBlockSched = async (req, res, next) => {
    const user = req.account;
    if (!user) {
        return res.status(401).redirect("/login");
    }

    const termCode = req.query.term || req.body.term || "";
    const DB = req.app.locals.database;
    const [currentTerm] = await DB.executeQuery(
        `SELECT t.id AS termID, t.year, t.term FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${user.id}' AND ` +
        `CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );
    if (!currentTerm) {
        return res.status(409).redirect("/chair/schedules");
    }

    const { termID, year, term } = currentTerm;
    req.term = {
        title: `${(term == 's') ? 'Summer' : toOrdinal(term)} Semester, ${year} - ${parseInt(year) + 1}`,
        id: termCode
    }
    req.data = {};
    next();
};

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

module.exports = { getFacultySched, getBlockSched, generateSchedule };