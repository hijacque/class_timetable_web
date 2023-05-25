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
        `(f.teach_load - p.assigned_load) > 0 AND p.term_id = '${term.id}' AND p.sched_status = 'open' AND ` +
        `d.chair_id = '${user.id}' ORDER BY f.status DESC`
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
        // prof.pref_scheds = await DB.executeQuery(
        //     `SELECT DISTINCT ps.subj_id FROM PrefSchedules ps INNER JOIN Preferences p ON ps.pref_id = p.id ` +
        //     `WHERE p.id = '${pref_id}' OR p.faculty_id = '${id}'`
        // )

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

function convertMinutesTime(time) {
    let hours = ("00" + Math.trunc(time / 60)).slice(-2);
    let minutes = ("00" + Math.trunc(time % 60)).slice(-2);
    return `${hours}:${minutes}`;
}

const getFacultySched = async (req, res, next) => {
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing editing faculty schedule."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
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
        `f.status, p.id AS pref_id, p.sched_status, CONCAT(p.assigned_load, " / ", f.teach_load) AS teach_load, ` +
        `p.status AS pref_status, p.sched_status FROM Terms t INNER JOIN Preferences p ON t.id = p.term_id ` +
        `INNER JOIN Faculty f ON p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id ` +
        `WHERE d.chair_id = '${user.id}' AND t.id = '${termID}' ORDER BY f.status, name`
    );

    const current = faculty.findIndex((value) => value.faculty_id === req.query.id);
    req.data.prevFaculty = faculty[current - 1] || null;
    req.data.nextFaculty = faculty[current + 1] || null;

    req.data.current = faculty[current];

    await DB.executeQuery(
        `SELECT DISTINCT s.title, CASE WHEN ps.pref_id = '${faculty[current].pref_id}' THEN TRUE ELSE FALSE END AS is_new FROM PrefSubjects ps INNER JOIN Subjects s ON ps.subj_id = s.id ` +
        `INNER JOIN Preferences p ON ps.pref_id = p.id WHERE ps.pref_id = '${faculty[current].pref_id}' OR ` +
        `p.faculty_id = '${faculty[current].id}' ORDER BY is_new, s.title`
    ).then((rows) => {
        const { oldPref, newPref } = rows.reduce((arr, subj) => {
            if (!arr.newPref.includes(subj.title))
                arr[(subj.is_new || arr.newPref.includes(subj.title)) ? "newPref" : "oldPref"].push(subj.title);
            return arr;
        }, { newPref: [], oldPref: [] });
        req.data.current.old_pref_subjs = oldPref;
        req.data.current.new_pref_subjs = newPref;
    });

    await DB.executeQuery(
        `SELECT ps.day, TRUNCATE((ps.start/60 - 7) * 2 + 1, 0) AS start_time, ` +
        `TRUNCATE((ps.end/60 - 7) * 2 + 1, 0) AS end_time FROM PrefSchedules ps INNER JOIN ` +
        `Preferences p ON ps.pref_id = p.id WHERE p.id = '${faculty[current].pref_id}' ` +
        `AND p.faculty_id = '${faculty[current].id}' ORDER BY ps.day, start_time, end_time`
    ).then(rows => {
        req.data.current.pref_scheds = rows.map(({ day, start_time, end_time }) => ({
            day: day, start: parseInt(start_time), end: parseInt(end_time)
        }));
        console.table(req.data.current.pref_scheds);
    });

    await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, s.units, co.title AS course, b.year, b.block_no, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) ` +
        `AS start_time, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end_time, sc.day AS day, sc.mode, r.name AS room, ` +
        `sc.start, sc.end, sc.subj_id, sc.room_id, sc.block_id FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id LEFT JOIN Courses co ON b.course_id = co.id ` +
        `INNER JOIN Subjects s ON sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id WHERE sc.term_id = '${termID}' AND ` +
        `sc.faculty_id = '${faculty[current].id}' ORDER BY sc.day, sc.start, course, b.year, b.block_no`
    ).then(data => {
        req.data.current.classes = data.map((sched) => {
            sched.start = convertMinutesTime(sched.start);
            sched.end = convertMinutesTime(sched.end);
            sched.duration = (sched.end_time - sched.start_time) / 2;
            return sched;
        }) || [];
    });

    if (faculty[current].sched_status != "open") {
        return next();
    }

    let deptSubjects = await DB.executeQuery(
        `SELECT cu.subj_id, s.title FROM Curricula cu INNER JOIN Courses co ON cu.course_id = co.id INNER JOIN Departments d ` +
        `ON co.dept_id = d.id INNER JOIN Subjects s ON cu.subj_id = s.id INNER JOIN Colleges col ON ` +
        `d.college_id = col.id AND s.college_id = col.id WHERE d.chair_id = '${user.id}' AND cu.term = '${term}'`
    );
    deptSubjects = deptSubjects.map(sub => sub.subj_id);

    const [deptClasses, otherClasses] = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title end as subject, ` +
        `sc.block_id, sc.subj_id, CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE ` +
        `TRUNCATE(SUM(sc.end - sc.start)/60, 1) END AS assigned_time, s.req_hours, co.title as course, b.year, ` +
        `b.block_no, co.title FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id INNER JOIN Courses co ON b.course_id = co.id LEFT JOIN Colleges col ON ` +
        `s.college_id = col.id WHERE sc.term_id = '${termID}' AND sc.subj_id IN ('${deptSubjects.join("', '")}') ` +
        `AND (sc.faculty_id IS NULL OR sc.faculty_id = '${faculty[current].id}') GROUP BY sc.block_id, sc.subj_id ` +
        `HAVING assigned_time < s.req_hours ORDER BY b.year, b.block_no, subject; ` +

        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title end as subject, ` +
        `sc.block_id, sc.subj_id, CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE ` +
        `TRUNCATE(SUM(sc.end - sc.start)/60, 1) END AS assigned_time, s.req_hours, co.title as course, b.year, ` +
        `b.block_no, co.title FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id INNER JOIN Courses co ON b.course_id = co.id LEFT JOIN Colleges col ON ` +
        `s.college_id = col.id WHERE sc.term_id = '${termID}' AND sc.subj_id NOT IN ('${deptSubjects.join("', '")}') ` +
        `AND (sc.faculty_id IS NULL OR sc.faculty_id = '${faculty[current].id}') GROUP BY sc.block_id, sc.subj_id ` +
        `HAVING assigned_time < s.req_hours ORDER BY b.year, b.block_no, subject;`
    );
    req.data.deptClasses = deptClasses;
    req.data.otherClasses = otherClasses;

    next();
};

const getBlockSched = async (req, res, next) => {
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing editing faculty schedule."
            }
        })
        return res.status(401).json({ redirect: "/logout" });
    }

    const termCode = req.query.term || req.body.term || "";
    const DB = req.app.locals.database;

    const [currentTerm] = await DB.executeQuery(
        `SELECT t.id AS termID, t.year, t.term, SUM(pr.sched_status IN ('open', 'saved', 'posted')) AS totalFaculty, ` +
        `SUM(pr.sched_status = 'saved') AS totalSaved, SUM(pr.sched_status = 'posted') AS totalPosted ` +
        `FROM Terms t INNER JOIN Preferences pr ON t.id = pr.term_id INNER JOIN Faculty f ON ` +
        `pr.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = "${user.id}" ` +
        `AND CONCAT(t.year, t.term) = '${termCode}' GROUP BY t.id LIMIT 1`
    );
    if (!currentTerm) {
        return res.status(409).redirect("/chair/schedules");
    }

    const { termID, year, term, totalFaculty, totalSaved, totalPosted } = currentTerm;
    req.term = {
        title: `${(term == 's') ? 'Summer' : toOrdinal(term)} Semester, ${year} - ${parseInt(year) + 1}`,
        id: termID,
        code: termCode,
        status: (totalPosted == totalFaculty) ? "posted" : (totalSaved == totalFaculty) ? "saved" : "open"
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

    const [deptClasses, otherClasses] = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END AS subject, ` +
        `SUM(CASE WHEN sc.start IS NULL OR sc.start IS NULL THEN 0 ELSE TRUNCATE((sc.end - sc.start)/60, 1) END) ` +
        `AS assigned_time, s.req_hours, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS faculty_name, ` +
        `sc.faculty_id, sc.subj_id FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id ` +
        `LEFT JOIN Faculty f ON sc.faculty_id = f.id WHERE sc.subj_id IN ('${deptSubjects.join("', '")}') AND ` +
        `sc.term_id = '${termID}' AND sc.block_id = '${blocks[current].id}' GROUP BY sc.block_id, sc.subj_id, ` +
        `sc.faculty_id, f.last_name, f.first_name, f.middle_name having assigned_time < s.req_hours ORDER BY subject;` +

        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END AS subject, ` +
        `SUM(CASE WHEN sc.start IS NULL OR sc.start IS NULL THEN 0 ELSE TRUNCATE((sc.end - sc.start)/60, 1) END) ` +
        `AS assigned_time, s.req_hours, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS faculty_name, ` +
        `sc.faculty_id, sc.subj_id FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Blocks b ON sc.block_id = b.id ` +
        `LEFT JOIN Faculty f ON sc.faculty_id = f.id WHERE sc.subj_id NOT IN ('${deptSubjects.join("', '")}') AND ` +
        `sc.term_id = '${termID}' AND sc.block_id = '${blocks[current].id}' GROUP BY sc.block_id, sc.subj_id, ` +
        `sc.faculty_id, f.last_name, f.first_name, f.middle_name having assigned_time < s.req_hours ORDER BY subject;`
    );
    req.data.deptClasses = deptClasses;
    req.data.otherClasses = otherClasses;

    await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, sc.start, sc.end, sc.subj_id, sc.room_id, sc.day, sc.mode, sc.faculty_id, r.name AS room, ` +
        `TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start_time, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end_time, ` +
        `CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS faculty_name, ` +
        `CASE WHEN blsc.total_assigned > 1 THEN TRUE ELSE FALSE END AS partial FROM Schedules sc ` +
        `INNER JOIN (SELECT term_id, subj_id, block_id, COUNT(*) AS total_assigned FROM Schedules WHERE ` +
        `term_id = '${termID}' AND block_id = '${blocks[current].id}' AND faculty_id IS NOT NULL ` +
        `GROUP BY term_id, subj_id, block_id) AS blsc ON sc.term_id = blsc.term_id AND ` +
        `sc.block_id = blsc.block_id AND sc.subj_id = blsc.subj_id INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Faculty f ON sc.faculty_id = f.id INNER JOIN ` +
        `Subjects s ON sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id ` +
        `ORDER BY sc.day, sc.start, sc.end, subject`
    ).then(data => {
        req.data.classes = data.map((sched) => {
            sched.start = convertMinutesTime(sched.start);
            sched.end = convertMinutesTime(sched.end);
            sched.duration = (sched.end_time - sched.start_time) / 2;
            sched.departmental = deptSubjects.some(subj => subj == sched.subj_id);
            return sched;
        }) || [];
    });

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
    const [{ deptName }] = await DB.executeQuery(
        `SELECT name AS deptName FROM Departments WHERE chair_id = '${user.id}'`
    );

    const wbIndex = req.workbooks.length;
    req.workbooks.push({
        id: `${deptName} Faculty Class Timetable (${currentTerm.year}-${currentTerm.term})`,
        tables: []
    });

    while (faculty.length > 0) {
        // get faculty's schedules
        currentFaculty = { id: faculty[0].id, name: faculty[0].name };
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

const saveFacultySchedule = async (req, res, next) => {
    const user = req.account;
    if (!user || user.type != "chair") {
        return res.status(401).cookie("serverMessage", {
            mode: 0,
            title: "Unauthorized request",
            body: "Please login again before saving faculty schedules."
        }).redirect("/logout");
    }

    const DB = req.app.locals.database;
    let incompleteScheds = await DB.executeQuery(
        `SELECT DISTINCT CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE TRUNCATE(SUM(sc.end - sc.start)/60, 1) ` +
        `END AS assigned_time, s.req_hours, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS prof, ` +
        `f.id, f.faculty_id FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id ` +
        `INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Terms t ON sc.term_id = t.id LEFT JOIN ` +
        `Faculty f ON sc.faculty_id = f.id INNER JOIN Preferences pr ON f.id = pr.faculty_id AND ` +
        `sc.term_id = pr.term_id INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' ` +
        (req.params.faculty ? `AND sc.faculty_id = '${req.params.faculty}' ` : "") +
        `AND CONCAT(t.year, t.term) = '${req.params.term}' GROUP BY sc.block_id, sc.subj_id, prof, f.id, f.faculty_id ` +
        `HAVING assigned_time < s.req_hours ORDER BY assigned_time, prof`
    );

    console.log("Incomplete faculty schedules:");
    if (incompleteScheds.length > 0) {
        if (req.params.faculty) {
            res.cookie("serverMessage", {
                mode: 2,
                title: "Unable to save faculty schedule",
                body: "<p>Some classes are not fully plotted.</p>"
            });
            return res.redirect(`/schedule/faculty?term=${req.params.term}&id=${req.body.facultyID}`);
        }

        incompleteScheds = [...new Set(
            incompleteScheds.map(({ prof, id }) => ({ name: prof, id: id }))
        )];
        console.table(incompleteScheds);
    }

    await DB.executeQuery(
        // update faculty schedules status to 'saved'
        `UPDATE Preferences pr INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id INNER JOIN Terms t ON pr.term_id = t.id SET pr.sched_status = 2 WHERE ` +
        (req.params.faculty ? `f.id = '${req.params.faculty}' AND ` : "") +
        `d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}'` +
        (incompleteScheds.length > 0 ? ` AND f.id NOT IN ('${incompleteScheds.map(sched => sched.id).join("', '")}');` : ";") +

        // update pending preference form status to 'unanswered'
        `UPDATE Preferences pr INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id INNER JOIN Terms t ON pr.term_id = t.id SET pr.status = 3 WHERE ` +
        (req.params.faculty ? `f.id = '${req.params.faculty}' AND ` : "") +
        `d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}' AND pr.status = 'pending'`
    );

    if (req.params.faculty) {
        res.cookie("serverMessage", {
            mode: 1,
            title: "Saved faculty schedule",
            body: "Successfully saved faculty schedule, you cannot add nor modify classes."
        });
        return res.redirect(`/schedule/faculty?term=${req.params.term}&id=${req.body.facultyID}`);
    } else if (incompleteScheds.length > 0) {
        res.cookie("serverMessage", {
            mode: 2,
            title: "Unable to save incomplete schedules",
            body: "<p>Some classes are not fully plotted in the following faculty's timetable:<br>" +
                `<ul><li>${incompleteScheds.map(sched => sched.name).join("</li><li>")}</li></ul></p>`
        });
    } else {
        res.cookie("serverMessage", {
            mode: 1,
            title: "Saved faculty schedules",
            body: "Successfully saved faculty schedules, you cannot add nor modify classes."
        });
    }

    next();
}

const postFacultySchedules = async (req, res, next) => {
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing editing faculty schedule."
            }
        })
        return res.status(401).redirect("/logout");
    }

    const DB = req.app.locals.database;
    const [{ totalUnsaved }] = await DB.executeQuery(
        `SELECT COUNT(*) AS totalUnsaved FROM Preferences pr INNER JOIN Terms t ON pr.term_id = t.id ` +
        `INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id ` +
        `WHERE d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}' AND ` +
        `pr.sched_status != 'saved'`
    );

    if (totalUnsaved > 0) {
        res.cookie("serverMessage", {
            mode: 0,
            title: "Could not post unsaved schedules",
            body: "All faculty schedules must be saved before posting"
        });
        return next();
    }

    await DB.executeQuery(
        `UPDATE Preferences pr INNER JOIN Terms t ON pr.term_id = t.id INNER JOIN Faculty f ON ` +
        `pr.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id SET pr.sched_status = 3 ` +
        `WHERE d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}'`
    );

    // TODO: send email notifications that schedules are posted
    try {
        const faculty = await DB.executeQuery(
            `SELECT u.email FROM Faculty f INNER JOIN Departments d ON f.dept_id = d.id INNER JOIN Users u ON ` +
            `f.id = u.id where d.chair_id = '${user.id}'`
        );
        await req.app.locals.mailer.sendEmail({
            to: faculty.map(f => f.email),
            subject: "Class Timetable New Schedule",
            html: "A new schedule has been listed."
        });
    } catch (error) {
        console.log(error);
    }

    res.cookie("serverMessage", {
        mode: 1,
        title: "Faculty Schedules posted",
        body: "Faculty in your department can now view their schedule for the term: " + req.params.term
    });
    next();
}

const unsaveFacultySchedule = async (req, res, next) => {
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing editing faculty schedule."
            }
        })
        return res.status(401).redirect("/logout");
    }

    const DB = req.app.locals.database;
    await DB.executeQuery(
        `UPDATE Preferences pr INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id INNER JOIN Terms t ON pr.term_id = t.id SET pr.sched_status = 1 WHERE ` +
        (req.params.faculty ? `f.id = '${req.params.faculty}' AND ` : "") +
        `d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}';` +
        `UPDATE Preferences pr INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id INNER JOIN Terms t ON pr.term_id = t.id SET pr.status = 1 WHERE ` +
        (req.params.faculty ? `f.id = '${req.params.faculty}' AND ` : "") +
        `d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}' AND pr.status = 'unanswered'`
    );

    if (req.params.faculty) {
        res.cookie("serverMessage", {
            mode: 1,
            title: "Opened faculty schedule",
            body: "You can continue editing the faculty schedule."
        });
        return res.redirect(`/schedule/faculty?term=${req.params.term}&id=${req.body.facultyID}`);
    } else {
        res.cookie("serverMessage", {
            mode: 1,
            title: "Opened faculty schedules",
            body: "You can continue editing the faculty schedules."
        });
    }
    next();
}

const unpostFacultySchedules = async (req, res, next) => {
    // check user credentials
    const user = req.account;
    if (!user || user.type != "chair") {
        res.cookie("serverMessage", {
            message: {
                mode: 0,
                title: "Unauthorized request",
                body: "Please login before accessing editing faculty schedule."
            }
        })
        return res.status(401).redirect("/logout");
    }

    const DB = req.app.locals.database;
    await DB.executeQuery(
        `UPDATE Preferences pr INNER JOIN Terms t ON pr.term_id = t.id INNER JOIN Faculty f ON ` +
        `pr.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id SET pr.sched_status = 1 ` +
        `WHERE d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}'`
    );

    res.cookie("serverMessage", {
        mode: 1,
        title: "Faculty Schedules posted",
        body: "Faculty in your department can now view their schedule for the term: " + req.params.term
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

module.exports = {
    getFacultySched, getBlockSched, generateSchedule,
    getBlockSchedTable, getFacultySchedTable,
    saveFacultySchedule, postFacultySchedules,
    unsaveFacultySchedule, unpostFacultySchedules
};
