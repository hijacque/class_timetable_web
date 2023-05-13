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
    if (!user || user.type != 'chair') {
        return res.status(401).redirect('/logout');
    }

    const DB = req.app.locals.database;
    const termCode = req.query.term || req.body.term;
    const [term] = await DB.executeQuery(
        `SELECT t.id AS id, t.term AS semester FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${user.id}' AND ` +
        `CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );

    if (!term) {
        return res.status(409).redirect("/chair/schedules");
    }

    req.termID = term.id;

    let deptSubjects = await DB.executeQuery(
        `SELECT cu.subj_id, s.title FROM Curricula cu INNER JOIN Courses co ON cu.course_id = co.id INNER JOIN Departments d ` +
        `ON co.dept_id = d.id INNER JOIN Subjects s ON cu.subj_id = s.id INNER JOIN Colleges col ON ` +
        `d.college_id = col.id AND s.college_id = col.id WHERE d.chair_id = '${user.id}' AND cu.term = '${term.semester}'`
    );
    deptSubjects = deptSubjects.map(sub => sub.subj_id);

    let classes = await DB.executeQuery(
        `SELECT sc.block_id AS block, sc.subj_id AS subj, s.units, s.req_hours AS hours, s.pref_rooms AS ` +
        `prefRooms FROM Schedules sc INNER JOIN Blocks b on sc.block_id = b.id INNER JOIN Courses co ON ` +
        `b.course_id = co.id INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Curricula cu ON ` +
        `sc.subj_id = cu.subj_id AND s.id = cu.subj_id AND co.id = cu.course_id INNER JOIN Departments d ON ` +
        `co.dept_id = d.id WHERE sc.term_id = '${term.id}' AND sc.faculty_id IS NULL AND ` +
        `d.chair_id = '${user.id}' AND sc.subj_id IN ('${deptSubjects.join("', '")}')`
    );
    classes = classes.map(c => ({ ...c, prefRooms: c.prefRooms.split(",") }));
    console.table(classes);

    let faculty = await DB.executeQuery(
        `SELECT p.faculty_id as id, p.id AS pref_id, (f.teach_load - p.assigned_load) AS teach_load FROM Preferences p ` +
        `INNER JOIN Faculty f ON p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id WHERE ` +
        `(f.teach_load - p.assigned_load) > 0 AND p.term_id = '${term.id}' AND d.chair_id = '${user.id}' ` +
        `ORDER BY f.status DESC`
    );

    console.log("Initial total classes: " + classes.length, "Total faculty in department: " + faculty.length);
    if (classes.length <= 0 || faculty.length <= 0) {
        return res.status(200).send(
            `There are no more blank classes to assign or all faculty are fully loaded.<br>` +
            `Go back to <a href="/chair/schedules?term=${termCode}">Schedules Tab</a>`
        );
    }

    console.log("Generating department schedule for term, " + termCode + "...\n");
    console.time("Genetic Faculty Loading execution time");
    const assignClasses = [];
    for (const prof of faculty) {
        let { id, teach_load, pref_id } = prof;
        if (classes.length <= 0) {
            break;
        }

        let subjects = await DB.executeQuery(
            `SELECT DISTINCT ps.subj_id FROM PrefSubjects ps INNER JOIN Preferences p ON ps.pref_id = p.id ` +
            `WHERE p.id = '${pref_id}' OR p.faculty_id = '${id}'`
        );
        subjects = subjects.map(({ subj_id }) => subj_id);

        const facultyLoader = new FacultyLoading(teach_load, 50, subjects, classes, 100);
        const optimalLoad = facultyLoader.evolve(50);

        prof.assign_load = optimalLoad.totalUnits;
        prof.pref_subjs = subjects;

        assignClasses.push(...optimalLoad.classes.map(c => ({ ...c, prof: id })));
        classes = classes.filter(c => !optimalLoad.classes.some(oc => oc.block == c.block && oc.subj == c.subj));
    }
    console.timeEnd("Genetic Faculty Loading execution time");

    console.log("\nFaculty loaded classes:");
    // assignClasses.sort((a, b) => a.course.localeCompare(b.course) || a.year - b.year || a.block_no - b.block_no)
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
        `Subjects s ON sc.subj_id = s.id WHERE t.id = '${term.id}' ORDER BY r.name, sc.block_id, sc.day, sc.start`
    ));

    console.log("\nList of rooms and availability:");
    console.table(rooms);

    console.time("\nIterative classroom scheduling exec. time");
    let classSchedule = scheduleClasses(assignClasses, rooms, 7, 15, 7, 2);
    console.timeEnd("\nIterative classroom scheduling exec. time");

    for (const classroom of classSchedule) {
        let { id, name, slots } = classroom;

        // separate old and new classroom schedules
        slots = slots.filter(c => c.partial != undefined);
        if (slots.length <= 0) {
            continue;
        }

        // output room schedules in console
        console.log("\n" + name);
        console.log("New assigned classes:");
        console.table(slots.sort((a) => a.partial));

        // separate classes that were assigned first from partial classes that were preempted
        let { firstClass, partialClass } = slots.reduce((arr, c) => {
            arr[(c.partial) ? "partialClass" : "firstClass"].push(c);
            return arr;
        }, { firstClass: [], partialClass: [] });

        let query = "";
        if (firstClass.length > 0) {
            query += firstClass.reduce((q, { block, subj, units, prof, day, start, end }) => {
                return q += `UPDATE Schedules SET faculty_id = '${prof}', day = ${day}, start = ${start}, ` +
                    `end = ${end}, room_id = '${id}', mode = 1 WHERE term_id = '${term.id}' AND ` +
                    `block_id = '${block}' AND subj_id = '${subj}' AND faculty_id IS NULL LIMIT 1;` +
                    `UPDATE Preferences pr LEFT JOIN Schedules sc ON pr.faculty_id = sc.faculty_id ` +
                    `SET pr.assigned_load = pr.assigned_load + ${units || 0} WHERE pr.term_id = '${term.id}' ` +
                    `AND pr.faculty_id = sc.faculty_id AND sc.block_id = '${block}' AND sc.subj_id = '${subj}' LIMIT 1;`;
            }, "");
        }

        // for preempted class times
        if (partialClass.length > 0) {
            query += `INSERT INTO Schedules VALUES (${partialClass.map(({ block, subj, prof, day, start, end }) => {
                return `'${term.id}', '${subj}', '${block}', '${prof}', '${id}', ${day}, ${start}, ${end}, 1`
            }).join("), (")});`;
        }

        try {
            await DB.executeQuery(query);
        } catch (error) {
            console.log(error);
            return res.status(501).redirect("/schedule/failed/" + termCode);
        }
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
        `f.status, p.status AS pref_status, p.id AS pref_id, CONCAT(p.assigned_load, " / ", f.teach_load) AS teach_load FROM ` +
        `Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON p.faculty_id = f.id ` +
        `INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' AND t.id = '${termID}' ` +
        `ORDER BY f.status, name`
    );

    const current = faculty.findIndex((value) => value.faculty_id === req.query.id);
    req.data.prevFaculty = faculty[current - 1] || null;
    req.data.nextFaculty = faculty[current + 1] || null;

    req.data.current = faculty[current];

    let deptSubjects = await DB.executeQuery(
        `SELECT cu.subj_id, s.title FROM Curricula cu INNER JOIN Courses co ON cu.course_id = co.id INNER JOIN Departments d ` +
        `ON co.dept_id = d.id INNER JOIN Subjects s ON cu.subj_id = s.id INNER JOIN Colleges col ON ` +
        `d.college_id = col.id AND s.college_id = col.id WHERE d.chair_id = '${user.id}' AND cu.term = '${term}'`
    );
    deptSubjects = deptSubjects.map(sub => sub.subj_id);

    req.data.current.classes = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, s.units, co.title AS course, b.year, b.block_no, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) ` +
        `AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, sc.day AS day, sc.mode, r.name AS room ` +
        `FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id LEFT JOIN Courses co ON b.course_id = co.id ` +
        `INNER JOIN Subjects s ON sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id WHERE sc.term_id = '${termID}' AND ` +
        `sc.faculty_id = '${faculty[current].id}' AND sc.subj_id IN ('${deptSubjects.join("', '")}') ORDER BY sc.day, sc.start, course, b.year, b.block_no`
    );

    const prefSubjs = await DB.executeQuery(
        `SELECT DISTINCT s.title FROM PrefSubjects ps INNER JOIN Subjects s ON ps.subj_id = s.id ` +
        `WHERE ps.pref_id = '${faculty[current].pref_id}' ORDER BY s.title`
    );
    req.data.current.pref_subjs = prefSubjs.map(subj => subj.title);

    const [deptClasses, otherClasses] = await DB.executeQuery(
        `SELECT DISTINCT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title end as subject, ` +
        `sc.block_id, sc.subj_id, CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE ` +
        `TRUNCATE(SUM(sc.end - sc.start)/60, 1) END AS assigned_time, s.req_hours, co.title as course, b.year, ` +
        `b.block_no, co.title FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id LEFT JOIN Courses co ON b.course_id = co.id LEFT JOIN Colleges col ON ` +
        `s.college_id = col.id LEFT JOIN Departments d ON col.id = d.college_id AND co.dept_id = d.id WHERE ` +
        `sc.term_id = '${termID}' AND d.chair_id = '${user.id}' AND (sc.faculty_id IS NULL OR ` +
        `sc.faculty_id = '${faculty[current].id}') GROUP BY sc.block_id, sc.subj_id ` +
        `HAVING assigned_time < s.req_hours ORDER BY b.year, b.block_no, subject;` +

        `SELECT DISTINCT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title end as subject, ` +
        `sc.block_id, sc.subj_id, CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE ` +
        `TRUNCATE(SUM(sc.end - sc.start)/60, 1) END AS assigned_time, s.req_hours, co.title as course, b.year, ` +
        `b.block_no FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id LEFT JOIN Courses co ON b.course_id = co.id LEFT JOIN Colleges col ON ` +
        `s.college_id = col.id LEFT JOIN Departments d ON col.id = d.college_id AND co.dept_id = d.id ` +
        `WHERE sc.term_id = '${termID}' AND sc.subj_id IN ('${deptSubjects.join("', '")}') ` +
        `AND d.chair_id != '${user.id}' GROUP BY sc.block_id, sc.subj_id HAVING assigned_time = 0 ` +
        `ORDER BY b.year, b.block_no, subject;`
    );

    req.data.deptClasses = deptClasses;
    req.data.otherClasses = otherClasses;

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
        id: termID,
        code: termCode
    }
    req.data = {};

    const about = req.query;
    // get classes with subjects that are in the department's course curricula and under their respective college
    let deptSubjects = await DB.executeQuery(
        `SELECT cu.subj_id, s.title FROM Curricula cu INNER JOIN Courses co ON cu.course_id = co.id INNER JOIN ` +
        `Departments d ON co.dept_id = d.id INNER JOIN Subjects s ON cu.subj_id = s.id INNER JOIN Colleges col ON ` +
        `d.college_id = col.id AND s.college_id = col.id WHERE d.chair_id = '${user.id}' AND cu.term = '${term}' ` +
        `AND cu.year = ${about.year}`
    );
    deptSubjects = deptSubjects.map(sub => sub.subj_id);

    const { courseID } = req.params;
    req.data.courseID = courseID;
    let blocks = await DB.executeQuery(
        `SELECT DISTINCT b.id, co.title AS course, b.year, b.block_no FROM Blocks b INNER JOIN Courses co ON ` +
        `b.course_id = co.id WHERE co.id = '${courseID}' AND b.term_id = '${termID}' ORDER BY b.year, b.block_no`
    );
    blocks = blocks.map(b => ({ ...b, ordinal_year: toOrdinal(b.year) }));
    const current = blocks.findIndex(({ year, block_no }) => year == about.year && block_no == about.block);
    req.data.prevBlock = blocks[current - 1] || null;
    req.data.nextBlock = blocks[current + 1] || null;

    req.data.current = blocks[current];

    req.data.leftClasses = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END AS subject, ` +
        `SUM(CASE WHEN sc.start IS NULL OR sc.start IS NULL THEN 0 ELSE TRUNCATE((sc.end - sc.start)/60, 1) END) ` +
        `AS assigned_time, s.req_hours, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS faculty_name, ` +
        `sc.faculty_id, sc.subj_id FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id ` +
        `LEFT JOIN Faculty f ON sc.faculty_id = f.id WHERE sc.subj_id IN ('${deptSubjects.join("', '")}') AND ` +
        `sc.term_id = '${termID}' AND sc.block_id = '${blocks[current].id}' GROUP BY sc.block_id, sc.subj_id, ` +
        `sc.faculty_id, f.last_name, f.first_name, f.middle_name having assigned_time < s.req_hours ORDER BY subject`
    );

    req.data.classes = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, ` +
        `sc.day, sc.mode, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS faculty_name, f.faculty_id, r.name AS room ` +
        `FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN ` +
        `Faculty f ON sc.faculty_id = f.id INNER JOIN Subjects s ON sc.subj_id = s.id LEFT JOIN Rooms r ON ` +
        `sc.room_id = r.id WHERE sc.term_id = '${termID}' AND sc.block_id = '${blocks[current].id}' AND ` +
        `sc.faculty_id IS NOT NULL ORDER BY sc.day, sc.start, sc.end, subject`
    );

    req.data.faculty = await DB.executeQuery(
        `SELECT f.id, f.status, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
        `CASE WHEN p.assigned_load < f.teach_load THEN CONCAT(p.assigned_load, " / ", f.teach_load) ELSE 'FULL' ` +
        `END AS teach_load FROM ` +
        `Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON p.faculty_id = f.id ` +
        `INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' AND t.id = '${termID}' ` +
        `ORDER BY teach_load, name`
    );

    next();
};

const getBlockSchedTable = async (req, res, next) => {
    const user = req.account;
    if (!user || user.type != "chair") {
        return res.status(401).send("You are not authorized to download the blocks' schedule.");
    }

    const DB = req.app.locals.database;
    const termCode = req.params.term || "";
    const [currentTerm] = await DB.executeQuery(
        `SELECT t.id, t.year, t.term FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${user.id}' AND ` +
        `CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );

    if (!currentTerm) {
        return res.status(409).send(
            "Invalid term code.<br><a href onclick='window.close()'>Go back to dashboard</a>"
        );
    }
    
    if (!req.workbooks) {
        req.workbooks = [];
    }

    const { year, block_no, course, courseID } = req.body;
    if (year && block_no && course && courseID) {
        let schedules = await DB.executeQuery(
            `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
            `AS subject, CONCAT('Prof. ', f.last_name, ', ', f.first_name, ' ', f.middle_name) AS occupant, ` +
            `TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, ` +
            `sc.day, sc.mode, r.name AS room FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id ` +
            `INNER JOIN Faculty f ON sc.faculty_id = f.id INNER JOIN Subjects s ON sc.subj_id = s.id ` +
            `LEFT JOIN Rooms r ON sc.room_id = r.id WHERE sc.term_id = '${currentTerm.id}' AND b.year = ${year} ` +
            `AND b.block_no = ${block_no} AND b.course_id = '${courseID}' ORDER BY sc.start, sc.day, subject`
        );

        req.workbooks.push({
            id: `${course} Block ${year}-${block_no} Class Timetable`,
            tables: [{
                id: `A.Y. ${currentTerm.year}-${currentTerm.term}`,
                body: schedules
            }]
        });
        return next();
    }

    const blocks = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END AS subject, ` +
        `b.id, co.title AS course, b.year, b.block_no, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) ` +
        `AS occupant, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) ` +
        `AS end, sc.day, sc.mode, r.name AS room FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id ` +
        `INNER JOIN Subjects s ON sc.subj_id = s.id LEFT JOIN Faculty f ON sc.faculty_id = f.id LEFT JOIN ` +
        `Rooms r ON sc.room_id = r.id LEFT JOIN Courses co ON b.course_id = co.id LEFT JOIN Departments d ON ` +
        `co.dept_id = d.id WHERE sc.term_id = '${currentTerm.id}' AND sc.faculty_id IS NOT NULL AND ` +
        `d.chair_id = '${user.id}' ORDER BY co.title, b.year, b.block_no, sc.start, sc.end, sc.day`
    );

    if (blocks.length <= 0) {
        return next();
        // return res.status(404).send("No block schedules were found.")
    }

    let currentCourse = blocks[0].course;
    let currentBlock;
    let wbIndex = 0;

    req.workbooks.push({
        id: `${currentCourse} Class Timetable (${currentTerm.year}-${currentTerm.term})`,
        tables: []
    });

    while (blocks.length > 0) {
        if (currentCourse != blocks[0].course) {
            wbIndex++;
            // create new workbook per course
            req.workbooks.push({
                id: `${currentCourse} Class Timetable (${currentTerm.year}-${currentTerm.term})`,
                tables: []
            });
            currentCourse = blocks[0].course;
        }

        // get block's schedules
        currentBlock = blocks[0].id;
        let blockSchedules = blocks.filter(b => b.course == currentCourse && b.id == currentBlock);
        // blockSchedules.sort((a, b) => a.start > b.start && a.day > b.day);
        blockSchedules = blockSchedules.map(b => {
            delete b.course;
            delete b.id;
            return b;
        });
        
        req.workbooks[wbIndex].tables.push({
            id: `Block ${blocks[0].year}-${blocks[0].block_no}`,
            body: blockSchedules
        });
        blocks.splice(0, blockSchedules.length);
    }

    next();
}

const getFacultySchedTable = async (req, res, next) => {
    const user = req.account;
    if (!user || user.type != "chair") {
        return res.status(401).send("You are not authorized to download the faculty's schedule.");
    }

    const DB = req.app.locals.database;
    const termCode = req.params.term || "";
    const [currentTerm] = await DB.executeQuery(
        `SELECT t.id, t.year, t.term FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${user.id}' AND ` +
        `CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );

    if (!currentTerm) {
        return res.status(409).send(
            "Invalid term code.<br><a href onclick='window.close()'>Go back to dashboard</a>"
        );
    }
    
    if (!req.workbooks) {
        req.workbooks = [];
    }

    const { id, name } = req.body;
    if (id && name) {
        console.log("Getting INDIVIDUAL faculty schedule...");
        let schedules = await DB.executeQuery(
            `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
            `AS subject, CONCAT(co.title, ' ', b.year, '-', b.block_no) AS occupant, ` +
            `TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, ` +
            `sc.day, sc.mode, r.name AS room FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id ` +
            `INNER JOIN Faculty f ON sc.faculty_id = f.id INNER JOIN Subjects s ON sc.subj_id = s.id ` +
            `LEFT JOIN Rooms r ON sc.room_id = r.id LEFT JOIN Courses co ON b.course_id = co.id LEFT JOIN ` +
            `Departments d ON f.dept_id = d.id WHERE sc.term_id = '${currentTerm.id}' AND d.chair_id = '${user.id}' ` +
            `AND CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) = '${name}' AND ` +
            `f.faculty_id = '${id}' ORDER BY sc.start, sc.day, subject`
        );
        
        req.workbooks.push({
            id: `${name} (${id}) Class Timetable`,
            tables: [{
                id: `A.Y. ${currentTerm.year}-${currentTerm.term}`,
                body: schedules
            }]
        });
        return next();
    }

    const faculty = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, CONCAT(co.title, ' ', b.year, '-', b.block_no) AS occupant, f.faculty_id AS id, ` +
        `CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
        `TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end, ` +
        `sc.day, sc.mode, r.name AS room FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id ` +
        `INNER JOIN Faculty f ON sc.faculty_id = f.id INNER JOIN Subjects s ON sc.subj_id = s.id ` +
        `LEFT JOIN Rooms r ON sc.room_id = r.id LEFT JOIN Courses co ON b.course_id = co.id LEFT JOIN ` +
        `Departments d ON f.dept_id = d.id WHERE sc.term_id = '${currentTerm.id}' AND d.chair_id = '${user.id}' ` +
        `ORDER BY f.last_name, f.first_name, f.middle_name, sc.start, sc.day, subject`
    );

    if (faculty.length <= 0) {
        return next();
        // return res.status(404).send("No block schedules were found.")
    }
    
    let currentFaculty;
    const [{deptName}] = await DB.executeQuery(
        `SELECT name AS deptName FROM Departments WHERE chair_id = '${user.id}'`
    );

    const wbIndex = req.workbooks.length;
    req.workbooks.push({
        id: `${deptName} Faculty Class Timetable (${currentTerm.year}-${currentTerm.term})`,
        tables: []
    });

    while (faculty.length > 0) {
        // get faculty's schedules
        currentFaculty = {id: faculty[0].id, name: faculty[0].name};
        let schedules = faculty.filter(f => f.id == currentFaculty.id);
        schedules = schedules.map(f => {
            delete f.id;
            delete f.name;
            return f;
        });

        let sheetTitle = `${currentFaculty.name} (${currentFaculty.id})`;
        req.workbooks[wbIndex].tables.push({
            id: sheetTitle.substring(0, Math.min(sheetTitle.length, 30)),
            body: schedules
        });
        console.log(sheetTitle);
        console.table(schedules);
        faculty.splice(0, schedules.length);
    }

    console.log("Getting ALL faculty schedule in department...");
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

module.exports = { getFacultySched, getBlockSched, generateSchedule, getBlockSchedTable, getFacultySchedTable };