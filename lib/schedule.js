const { FacultyLoading, scheduleClasses } = require("./genetic-timetable");
const { convertMinutesTime, toWeekDay } = require("./../lib/time-conversion");

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
        `SELECT t.id AS id, t.year, t.term AS semester FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id ` +
        `INNER JOIN Departments d ON col.id = d.college_id WHERE d.chair_id = '${user.id}' AND ` +
        `CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );

    if (!term) {
        return res.status(409).redirect("/chair/schedules");
    }

    req.termID = term.id;

    // separate classes into major and minor
    let [majorClasses, minorClasses] = await DB.executeQuery(
        `SELECT sc.block_id AS block, sc.subj_id AS subj, sub.units, sub.req_hours AS hours, sub.pref_rooms ` +
        `AS prefRooms FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN ` +
        `Subjects sub ON sc.subj_id = sub.id INNER JOIN Courses co ON b.course_id = co.id INNER JOIN ` +
        `Departments d ON co.dept_id = d.id LEFT JOIN Colleges col ON sub.college_id = col.id AND ` +
        `d.college_id = col.id WHERE sc.term_id = '${term.id}' AND sc.faculty_id IS NULL AND ` +
        `sc.mode IS NULL AND d.chair_id = '${user.id}' AND col.id IS NOT NULL;` +

        `SELECT sc.block_id AS block, sc.subj_id AS subj, sub.units, sub.req_hours AS hours, sub.pref_rooms ` +
        `AS prefRooms FROM Schedules sc INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN ` +
        `Subjects sub ON sc.subj_id = sub.id INNER JOIN Courses co ON b.course_id = co.id INNER JOIN ` +
        `Departments d ON co.dept_id = d.id LEFT JOIN Colleges col ON sub.college_id = col.id AND ` +
        `d.college_id = col.id WHERE sc.term_id = '${term.id}' AND sc.faculty_id IS NULL AND ` +
        `sc.mode IS NULL AND d.chair_id = '${user.id}' AND col.id IS NULL;`
    );
    majorClasses = majorClasses.map(c => ({ ...c, prefRooms: c.prefRooms.split(",") }));
    minorClasses = minorClasses.map(c => ({ ...c, prefRooms: c.prefRooms.split(",") }));

    let faculty = await DB.executeQuery(
        req.params.facultyID ?
            `SELECT p.faculty_id as id, p.id AS pref_id, (f.teach_load - p.assigned_load) AS teach_load, ` +
            `COUNT(DISTINCT sc.subj_id) AS total_classes, CASE WHEN f.teach_load >= 21 THEN 4 ELSE 3 END AS req_classes FROM Preferences p INNER JOIN Faculty f ON p.faculty_id = f.id ` +
            `LEFT JOIN Schedules sc ON p.term_id = sc.term_id AND f.id = sc.faculty_id WHERE ` +
            `(f.teach_load - p.assigned_load) > 0 AND p.term_id = '${term.id}' AND p.sched_status = 'open' ` +
            `AND f.id = '${req.params.facultyID}' GROUP BY id, pref_id, teach_load, f.status ` +
            `ORDER BY f.status DESC, total_classes LIMIT 1` :

            `SELECT p.faculty_id as id, p.id AS pref_id, (f.teach_load - p.assigned_load) AS teach_load, ` +
            `COUNT(DISTINCT sc.subj_id) AS total_classes, CASE WHEN f.teach_load >= 21 THEN 4 ELSE 3 END AS req_classes FROM Preferences p INNER JOIN Faculty f ON p.faculty_id = f.id ` +
            `INNER JOIN Departments d ON f.dept_id = d.id LEFT JOIN Schedules sc ON p.term_id = sc.term_id AND ` +
            `f.id = sc.faculty_id WHERE (f.teach_load - p.assigned_load) > 0 AND ` +
            `p.term_id = '${term.id}' AND p.sched_status = 'open' AND d.chair_id = '${user.id}' ` +
            `GROUP BY id, pref_id, teach_load, f.status ORDER BY f.status DESC, total_classes`
    );

    console.log("Initial total major classes: " + majorClasses.length, "Total faculty in department: " + faculty.length);
    console.table(faculty);

    if (minorClasses.length + majorClasses.length <= 0 || faculty.length <= 0) {
        res.cookie("serverMessage", {
            mode: 3,
            title: "No more classes to schedule",
            body: `Could not plot unassigned schedules for A.Y. ${term.year}-${term.year + 1}, ` +
                `${term.semester == "s" ? "Summer" : toOrdinal(term.semester)} Semester`
        });
        return next();
    }

    let rooms = initRooms(await DB.executeQuery(
        `SELECT r.id, r.name, sc.block_id AS block, sc.subj_id AS subj, s.units, sc.faculty_id AS prof, sc.day, ` +
        `sc.start, sc.end FROM Terms t LEFT JOIN Buildings bu ON t.school_id = bu.school_id INNER JOIN Rooms r ON ` +
        `bu.id = r.bldg_id LEFT JOIN Schedules sc ON t.id = sc.term_id AND r.id = sc.room_id LEFT JOIN ` +
        `Subjects s ON sc.subj_id = s.id WHERE t.id = '${term.id}' ORDER BY r.name, sc.block_id, sc.day, sc.start`
    ));

    console.log("\nList of rooms and availability:");
    console.table(rooms);

    console.log("Generating schedule for term, " + termCode + "...\n");
    console.time("Genetic Faculty Loading execution time");

    // load only major classes to department's faculty
    // const assignClasses = [];
    let limitClasses = faculty.reduce((acc, f) => {
        let totalReqClasses = Math.max(0, f.req_classes - f.total_classes) + acc;
        return (totalReqClasses > majorClasses) ? acc : totalReqClasses;
    }, 0);
    console.log("Total minimum classes: " + limitClasses);

    for (let i = 0; i < faculty.length; i++) {
        let { id, teach_load, pref_id, req_classes, total_classes } = faculty[i];
        if (majorClasses.length <= 0) {
            break;
        }

        let [subjects, consultHours, prefSched] = await DB.executeQuery(
            `SELECT DISTINCT ps.subj_id FROM PrefSubjects ps INNER JOIN Preferences p ON ps.pref_id = p.id ` +
            `WHERE p.id = '${pref_id}' OR p.faculty_id = '${id}';` +

            `SELECT day, start, end FROM ConsultationHours WHERE faculty_id = '${id}';` +

            `SELECT day, start, end FROM PrefSchedules WHERE pref_id = '${pref_id}';`
        );
        subjects = subjects.map(({ subj_id }) => subj_id);

        const facultyLoader = new FacultyLoading(teach_load, 50, subjects, majorClasses, majorClasses.length);
        let { classes, fitness } = facultyLoader.evolve(50, 0.75);

        let remainingClasses = majorClasses.length - classes.length;
        limitClasses -= req_classes;
        if (remainingClasses < limitClasses && total_classes < req_classes) {
            classes.sort((a, b) => subjects.includes(a.subj) || subjects.includes(b.subj));
            classes = classes.slice(0, Math.max(req_classes, limitClasses - remainingClasses));
        }

        faculty[i].assign_load = classes.reduce((acc, c) => acc + c.units, 0);
        faculty[i].pref_subjs = subjects;
        faculty[i].added_classes = classes.length;

        // console.log("Currently loading faculty ...");
        // console.table(faculty[i]);
        console.log("Fitness level of optimal load: " + fitness);

        if (classes.length > 0) {
            classes = classes.map(c => ({ ...c, prof: id, pref_sched: prefSched }));
            rooms = scheduleClasses(classes, rooms, 6, 14, 7, 2);

            majorClasses = majorClasses.filter(c => !classes.some(oc => oc.block == c.block && oc.subj == c.subj));
        }
    }
    console.timeEnd("Genetic Faculty Loading execution time");

    console.log("\nUnassigned major classes:");
    console.table(majorClasses);

    console.log("\nDepartmental Faculty Information:");
    console.table(faculty);

    majorClasses = undefined;

    rooms = scheduleClasses(minorClasses, rooms, 6, 14, 7, 2);

    for (const classroom of rooms) {
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
                return q += `UPDATE Schedules SET faculty_id = ${prof ? `'${prof}'` : 'NULL'}, day = ${day}, ` +
                    `start = ${start}, end = ${end}, room_id = '${id}', mode = 1 WHERE term_id = '${term.id}' ` +
                    `AND block_id = '${block}' AND subj_id = '${subj}' AND faculty_id IS NULL LIMIT 1;` +
                    `UPDATE Preferences pr LEFT JOIN Schedules sc ON pr.faculty_id = sc.faculty_id ` +
                    `SET pr.assigned_load = pr.assigned_load + ${units || 0} WHERE pr.term_id = '${term.id}' ` +
                    `AND pr.faculty_id = sc.faculty_id AND sc.block_id = '${block}' AND sc.subj_id = '${subj}' LIMIT 1;`;
            }, "");
        }

        // for preempted class times
        if (partialClass.length > 0) {
            query += `INSERT INTO Schedules VALUES (${partialClass.map(({ block, subj, prof, day, start, end }) => {
                return `'${term.id}', '${subj}', '${block}', ` + (prof ? `'${prof}', ` : 'NULL, ') +
                    `'${id}', ${day}, ${start}, ${end}, 1`
            }).join("), (")});`;
        }

        try {
            await DB.executeQuery(query);
        } catch (error) {
            console.error(error);
            res.cookie("serverMessage", {
                mode: 0,
                title: "Schedule Generation Failed",
                body: `Could not auto-generate schedule plotting for A.Y. ${term.year}-${term.year + 1}, ` +
                    `${term.semester == "s" ? "Summer" : toOrdinal(term.semester)} Semester`
            });
            return next();
        }
    }

    console.log("Successfully generated department schedule for term, " + termCode + " <3");
    res.cookie("serverMessage", {
        mode: 1,
        title: "Generated Schedule",
        body: `Successfully auto-plotted schedules for A.Y. ${term.year}-${term.year + 1}, ` +
            `${term.semester == "s" ? "Summer" : toOrdinal(term.semester)} Semester<br>` +
            `Some schedules are only partially plotted, please finalize on your accord.`
    });

    next();
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
        `SELECT f.id, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
        `f.status, p.id AS pref_id, p.sched_status, p.assigned_load, f.teach_load, ` +
        `p.status AS pref_status, p.sched_status FROM Terms t INNER JOIN Preferences p ON t.id = p.term_id ` +
        `INNER JOIN Faculty f ON p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id ` +
        `WHERE d.chair_id = '${user.id}' AND t.id = '${termID}' ORDER BY f.status, name`
    );

    const current = Math.max(0, faculty.findIndex((f) => f.id === req.query.id));
    req.data.prevFaculty = faculty[current - 1] || null;
    req.data.nextFaculty = faculty[current + 1] || null;

    req.data.current = faculty[current];
    await DB.executeQuery(
        `SELECT * FROM ConsultationHours WHERE faculty_id = '${faculty[current].id}' ORDER BY day`
    ).then((data) => {
        req.data.current.consultation = data.map(
            (ch) => `${toWeekDay(ch.day, true).toUpperCase()} ${convertMinutesTime(ch.start)} ` +
                `${ch.start >= 720 ? 'PM' : 'AM'}-${convertMinutesTime(ch.end)} ${ch.end >= 720 ? 'PM' : 'AM'}`
        ).join(", ");
    });

    await DB.executeQuery(
        `SELECT DISTINCT s.title, CASE WHEN ps.pref_id = '${faculty[current].pref_id}' THEN TRUE ` +
        `ELSE FALSE END AS is_new FROM PrefSubjects ps INNER JOIN Subjects s ON ps.subj_id = s.id ` +
        `INNER JOIN Preferences p ON ps.pref_id = p.id INNER JOIN Terms t ON p.term_id = t.id ` +
        `WHERE (ps.pref_id = '${faculty[current].pref_id}' OR p.faculty_id = '${faculty[current].id}') ` +
        `AND t.term = '${term}' ORDER BY is_new, s.title`
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
        `SELECT ps.day, (TRUNCATE(ps.start/60, 0) - 7) * 2 + 1 AS start_time, ` +
        `(TRUNCATE(ps.end/60, 0) - 7) * 2 + 1 AS end_time FROM PrefSchedules ps INNER JOIN ` +
        `Preferences p ON ps.pref_id = p.id WHERE p.id = '${faculty[current].pref_id}' ` +
        `AND p.faculty_id = '${faculty[current].id}' ORDER BY ps.day, start_time, end_time`
    ).then((rows) => {
        req.data.current.pref_scheds = rows.map(({ day, start_time, end_time }) => ({
            day: parseInt(day), start: parseInt(start_time), end: parseInt(end_time)
        }));
        console.table(req.data.current.pref_scheds);
    });

    let deptSubjects = await DB.executeQuery(
        `SELECT cu.subj_id, s.title FROM Curricula cu INNER JOIN Courses co ON cu.course_id = co.id INNER JOIN ` +
        `Departments d ON co.dept_id = d.id INNER JOIN Subjects s ON cu.subj_id = s.id INNER JOIN Colleges col ON ` +
        `d.college_id = col.id AND s.college_id = col.id WHERE d.chair_id = '${user.id}' AND cu.term = '${term}'`
    );
    deptSubjects = deptSubjects.map(sub => sub.subj_id);

    await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END AS ` +
        `subject, s.units, s.req_hours, co.title AS course, b.year, b.block_no, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) ` +
        `AS start_time, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end_time, sc.day AS day, sc.mode, r.name AS room, ` +
        `bu.name AS building, sc.start, sc.end, sc.subj_id, sc.room_id, sc.block_id FROM Schedules sc INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id LEFT JOIN Courses co ON b.course_id = co.id INNER JOIN Subjects s ON ` +
        `sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id LEFT JOIN Buildings bu ON r.bldg_id = bu.id ` +
        `WHERE sc.term_id = '${termID}' AND sc.faculty_id = '${faculty[current].id}' ` +
        `ORDER BY sc.subj_id, course, b.year, b.block_no, sc.day, sc.start; ` +

        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, s.units, s.req_hours, co.title AS course, b.year, b.block_no, TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) ` +
        `AS start_time, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end_time, sc.day AS day, sc.mode, r.name AS room, ` +
        `bu.name AS building, sc.start, sc.end, sc.subj_id, sc.room_id, sc.block_id FROM Schedules sc INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id LEFT JOIN Courses co ON b.course_id = co.id INNER JOIN Subjects s ON ` +
        `sc.subj_id = s.id LEFT JOIN Rooms r ON sc.room_id = r.id LEFT JOIN Buildings bu ON r.bldg_id = bu.id ` +
        `WHERE sc.term_id = '${termID}' AND sc.faculty_id IS NULL AND sc.mode IS NOT NULL AND sc.subj_id IN ` +
        `('${deptSubjects.join("', '")}') ORDER BY sc.subj_id, course, b.year, b.block_no;`
    ).then(([fullSched, partialSched]) => {
        const colors = [...new Set(fullSched.map(sched => sched.subj_id + sched.block_id))];
        let i = 0;
        req.data.current.classes = fullSched.map((sched) => {
            sched.color = (sched.subj_id + sched.block_id == colors[i]) ?
                "hsl(" + (i * (360 / colors.length) % 360) + ",70%,75%)" :
                "hsl(" + (++i * (360 / colors.length) % 360) + ",70%,75%)";
            sched.start = convertMinutesTime(sched.start);
            sched.end = convertMinutesTime(sched.end);
            sched.duration = (sched.end_time - sched.start_time) / 2;
            return sched;
        }) || [];
        req.data.current.partialClasses = partialSched.map((sched) => {
            sched.start = convertMinutesTime(sched.start);
            sched.end = convertMinutesTime(sched.end);
            sched.duration = (sched.end_time - sched.start_time) / 2;
            return sched;
        }) || [];
    });

    if (faculty[current].sched_status != "open") {
        return next();
    }

    req.data.classrooms = await DB.executeQuery(
        `SELECT r.id, r.name, b.name AS bldg FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id INNER JOIN ` +
        `Terms t ON b.school_id = t.school_id WHERE t.id = '${termID}' ORDER BY r.name, bldg`
    );

    const [deptClasses, otherClasses] = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title end as subject, ` +
        `sc.block_id, sc.subj_id, CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE ` +
        `TRUNCATE(SUM(sc.end - sc.start)/60, 1) END AS assigned_time, s.req_hours, co.title as course, b.year, ` +
        `b.block_no, co.title FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id INNER JOIN Courses co ON b.course_id = co.id LEFT JOIN Departments d ON ` +
        `co.dept_id = d.id LEFT JOIN Colleges col ON d.college_id = col.id WHERE sc.term_id = '${termID}' AND ` +
        `sc.subj_id IN ('${deptSubjects.join("', '")}') AND d.chair_id = '${user.id}' AND ` +
        `(sc.faculty_id IS NULL OR sc.faculty_id = '${faculty[current].id}') GROUP BY sc.block_id, sc.subj_id ` +
        `HAVING assigned_time < s.req_hours ORDER BY b.year, b.block_no, subject; ` +

        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title end as subject, ` +
        `sc.block_id, sc.subj_id, CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE ` +
        `TRUNCATE(SUM(sc.end - sc.start)/60, 1) END AS assigned_time, s.req_hours, co.title as course, b.year, ` +
        `b.block_no, co.title FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id INNER JOIN Blocks b ON ` +
        `sc.block_id = b.id INNER JOIN Courses co ON b.course_id = co.id LEFT JOIN Departments d ON ` +
        `co.dept_id = d.id LEFT JOIN Colleges col ON d.college_id = col.id WHERE sc.term_id = '${termID}' ` +
        `AND sc.subj_id IN ('${deptSubjects.join("', '")}') AND d.chair_id != '${user.id}' AND ` +
        `(sc.faculty_id IS NULL OR sc.faculty_id = '${faculty[current].id}') GROUP BY sc.block_id, sc.subj_id ` +
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
        `sc.faculty_id, sc.subj_id, sc.block_id FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id ` +
        `LEFT JOIN Faculty f ON sc.faculty_id = f.id WHERE sc.subj_id IN ('${deptSubjects.join("', '")}') AND ` +
        `sc.term_id = '${termID}' AND sc.block_id = '${blocks[current].id}' GROUP BY sc.block_id, sc.subj_id, ` +
        `sc.faculty_id, f.last_name, f.first_name, f.middle_name having assigned_time < s.req_hours ` +
        `ORDER BY sc.block_id, subject;` +

        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END AS subject, ` +
        `SUM(CASE WHEN sc.start IS NULL OR sc.start IS NULL THEN 0 ELSE TRUNCATE((sc.end - sc.start)/60, 1) END) ` +
        `AS assigned_time, s.req_hours, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS faculty_name, ` +
        `sc.faculty_id, sc.subj_id, sc.block_id FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id LEFT JOIN ` +
        `Faculty f ON sc.faculty_id = f.id WHERE sc.subj_id NOT IN ('${deptSubjects.join("', '")}') AND ` +
        `sc.term_id = '${termID}' AND sc.block_id = '${blocks[current].id}' GROUP BY sc.block_id, sc.subj_id, ` +
        `sc.faculty_id, f.last_name, f.first_name, f.middle_name HAVING assigned_time < s.req_hours ` +
        `ORDER BY sc.block_id, subject;`
    );
    req.data.deptClasses = deptClasses;
    req.data.otherClasses = otherClasses;

    // get schedules (full - has prof, partial - no prof)
    await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, sc.start, sc.end, sc.subj_id, sc.room_id, sc.day, sc.mode, sc.faculty_id, r.name AS room, ` +
        `TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start_time, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end_time, ` +
        `CASE WHEN sc.faculty_id IS NOT NULL THEN CONCAT('Prof. ', f.last_name, ', ', f.first_name, ' ', f.middle_name) ` +
        `ELSE 'No professor yet' END AS faculty, bu.name AS building, (sc.faculty_id IS NULL) AS partial, ` +
        `CASE WHEN blsc.total_assigned > 1 THEN TRUE ELSE FALSE END AS partial, pr.sched_status FROM Schedules sc INNER JOIN ` +
        `(SELECT term_id, subj_id, block_id, COUNT(*) AS total_assigned FROM Schedules WHERE ` +
        `term_id = '${termID}' AND block_id = '${blocks[current].id}' GROUP BY term_id, subj_id, block_id) ` +
        `AS blsc ON sc.term_id = blsc.term_id AND sc.block_id = blsc.block_id AND sc.subj_id = blsc.subj_id ` +
        `INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Subjects s ON sc.subj_id = s.id LEFT JOIN ` +
        `Faculty f ON sc.faculty_id = f.id INNER JOIN Preferences pr ON f.id = pr.faculty_id LEFT JOIN Rooms r ON ` +
        `sc.room_id = r.id LEFT JOIN Buildings bu ON ` +
        `r.bldg_id = bu.id WHERE sc.mode IS NOT NULL AND sc.faculty_id IS NOT NULL ORDER BY subject, sc.start;` +

        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, sc.start, sc.end, sc.subj_id, sc.room_id, sc.day, sc.mode, sc.faculty_id, r.name AS room, ` +
        `TRUNCATE((sc.start/60 - 7) * 2 + 1, 0) AS start_time, TRUNCATE((sc.end/60 - 7) * 2 + 1, 0) AS end_time, ` +
        `CASE WHEN sc.faculty_id IS NOT NULL THEN CONCAT('Prof. ', f.last_name, ', ', f.first_name, ' ', f.middle_name) ` +
        `ELSE 'No professor yet' END AS faculty, bu.name AS building, (sc.faculty_id IS NULL) AS partial, ` +
        `CASE WHEN blsc.total_assigned > 1 THEN TRUE ELSE FALSE END AS partial FROM Schedules sc INNER JOIN ` +
        `(SELECT term_id, subj_id, block_id, COUNT(*) AS total_assigned FROM Schedules WHERE ` +
        `term_id = '${termID}' AND block_id = '${blocks[current].id}' GROUP BY term_id, subj_id, block_id) ` +
        `AS blsc ON sc.term_id = blsc.term_id AND sc.block_id = blsc.block_id AND sc.subj_id = blsc.subj_id ` +
        `INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Subjects s ON sc.subj_id = s.id LEFT JOIN ` +
        `Faculty f ON sc.faculty_id = f.id LEFT JOIN Rooms r ON sc.room_id = r.id LEFT JOIN Buildings bu ON ` +
        `r.bldg_id = bu.id WHERE sc.mode IS NOT NULL AND sc.faculty_id IS NULL ORDER BY sc.start, sc.end, subject;`
    ).then(([fullSched, partialSched]) => {
        const colors = [...new Set(fullSched.map(sched => sched.subj_id))];
        let i = 1;
        req.data.classes = fullSched.map((sched) => {
            sched.color = (sched.subj_id == colors[i - 1]) ?
                "hsl(" + (i * (360 / colors.length) % 360) + ",70%,75%)" :
                "hsl(" + (++i * (360 / colors.length) % 360) + ",70%,75%)";
            sched.start = convertMinutesTime(sched.start);
            sched.end = convertMinutesTime(sched.end);
            sched.duration = (sched.end_time - sched.start_time) / 2;
            return sched;
        }) || [];
        // console.table(req.data.current.classes);

        req.data.partialClasses = partialSched.map((sched) => {
            sched.start = convertMinutesTime(sched.start);
            sched.end = convertMinutesTime(sched.end);
            sched.duration = (sched.end_time - sched.start_time) / 2;
            sched.departmental = deptSubjects.some(subj => subj == sched.subj_id);
            return sched;
        }) || [];
        // console.table(classes);
    });

    req.data.classrooms = await DB.executeQuery(
        `SELECT r.id, r.name, b.name AS bldg FROM Rooms r INNER JOIN Buildings b ON r.bldg_id = b.id INNER JOIN ` +
        `Terms t ON b.school_id = t.school_id WHERE t.id = '${termID}' ORDER BY r.name, bldg`
    );

    req.data.faculty = await DB.executeQuery(
        `SELECT f.id, f.status, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS name, ` +
        `CASE WHEN p.assigned_load < f.teach_load THEN CONCAT(p.assigned_load, " / ", f.teach_load) ELSE 'FULL' ` +
        `END AS teach_load FROM Terms t INNER JOIN Preferences p ON t.id = p.term_id INNER JOIN Faculty f ON ` +
        `p.faculty_id = f.id INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' ` +
        `AND t.id = '${termID}' AND p.sched_status = 'open' ORDER BY teach_load, name`
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
                title: `${course} Block ${year}-${block_no}<br>Class Schedule for A.Y. ${currentTerm.year}-${currentTerm.term}`,
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
        req.workbooks[wbIndex].tables.push({
            id: `Block ${blocks[0].year}-${blocks[0].block_no}`,
            title: `${blocks[0].course} Block ${blocks[0].year}-${blocks[0].block_no}<br>Class Schedule for A.Y. ${currentTerm.year}-${currentTerm.term}`,
            body: blockSchedules.map(b => {
                delete b.course;
                delete b.id;
                return b;
            })
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
            id: `${name} Class Timetable`,
            tables: [{
                id: `A.Y. ${currentTerm.year}-${currentTerm.term}`,
                body: schedules,
                title: `${name}<br>Class Schedule for A.Y. ${currentTerm.year}-${currentTerm.term}`
            }]
        });
        return next();
    }

    const faculty = await DB.executeQuery(
        `SELECT CASE WHEN s.type IS NOT NULL THEN CONCAT(s.title, ' (', s.type, ')') ELSE s.title END ` +
        `AS subject, f.status, CONCAT(co.title, ' ', b.year, '-', b.block_no) AS occupant, f.faculty_id AS id, ` +
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
        currentFaculty = { id: faculty[0].id, name: faculty[0].name, status: faculty[0].status };
        let schedules = faculty.filter(f => f.id == currentFaculty.id);

        let aboutFaculty = `${currentFaculty.name} (${currentFaculty.id})`;
        req.workbooks[wbIndex].tables.push({
            id: aboutFaculty.length > 30 ? aboutFaculty.slice(0, 27) + "..." : aboutFaculty,
            title: `${aboutFaculty}<br>Class Schedule for A.Y. ${currentTerm.year}-${currentTerm.term}`,
            body: schedules = schedules.map(f => {
                delete f.id;
                delete f.name;
                return f;
            })
        });

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
        `SELECT CASE WHEN SUM(sc.end - sc.start) IS NULL THEN 0 ELSE TRUNCATE(SUM(sc.end - sc.start)/60, 1) ` +
        `END AS assigned_time, s.req_hours, CONCAT(f.last_name, ', ', f.first_name, ' ', f.middle_name) AS prof, ` +
        `f.id FROM Schedules sc INNER JOIN Subjects s ON sc.subj_id = s.id ` +
        `INNER JOIN Blocks b ON sc.block_id = b.id INNER JOIN Terms t ON sc.term_id = t.id LEFT JOIN ` +
        `Faculty f ON sc.faculty_id = f.id INNER JOIN Preferences pr ON f.id = pr.faculty_id AND ` +
        `sc.term_id = pr.term_id INNER JOIN Departments d ON f.dept_id = d.id WHERE d.chair_id = '${user.id}' ` +
        (req.body.facultyID ? `AND sc.faculty_id = '${req.body.facultyID}' ` : "") +
        `AND CONCAT(t.year, t.term) = '${req.params.term}' GROUP BY sc.block_id, sc.subj_id, prof, f.id, f.faculty_id ` +
        `HAVING assigned_time < s.req_hours ORDER BY assigned_time, prof`
    );

    console.table(incompleteScheds);

    console.log("Incomplete faculty schedules:");
    if (incompleteScheds.length > 0) {
        if (req.body.facultyID) {
            req.incompleteScheds = true;
            return next();
        }
        
        req.incompleteScheds = [...new Set(incompleteScheds.map(sched => sched.prof))];
    }

    // update complete faculty schedules status to 'saved' and preference form status to 'unanswered'
    let query = `UPDATE Preferences pr INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id INNER JOIN Terms t ON pr.term_id = t.id SET pr.sched_status = 2 WHERE ` +
        (req.body.facultyID ? `f.id = '${req.body.facultyID}' AND ` : "") +
        `d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}'` +
        (incompleteScheds.length > 0 ? ` AND f.id NOT IN ('${[...new Set(incompleteScheds.map(sched => sched.id))].join("', '")}')` : "");

    await DB.executeQuery(query).catch((error) => console.log(error));

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
    let query = `UPDATE Preferences pr INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id INNER JOIN Terms t ON pr.term_id = t.id SET pr.sched_status = 1 WHERE ` +
        (req.body.facultyID ? `f.id = '${req.body.facultyID}' AND ` : "") +
        `d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}';` +
        `UPDATE Preferences pr INNER JOIN Faculty f ON pr.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id INNER JOIN Terms t ON pr.term_id = t.id SET pr.status = 1 WHERE ` +
        (req.body.facultyID ? `f.id = '${req.body.facultyID}' AND ` : "") +
        `d.chair_id = '${user.id}' AND CONCAT(t.year, t.term) = '${req.params.term}' AND pr.status = 'unanswered'`;
    console.log(query);

    await DB.executeQuery(query);

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

const resetSchedule = async (req, res, next) => {
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

    const termCode = req.params.term || req.body.term || "";
    const DB = req.app.locals.database;

    const [currentTerm] = await DB.executeQuery(
        `SELECT t.id FROM Terms t INNER JOIN Colleges col ON t.school_id = col.school_id INNER JOIN ` +
        `Departments d ON col.id = d.college_id WHERE d.chair_id = "${user.id}" AND CONCAT(t.year, t.term) = '${termCode}' LIMIT 1`
    );

    console.log(currentTerm);
    if (!currentTerm) {
        return res.status(409).redirect("/chair/schedules");
    }

    DB.executeQuery(
        // delete partial schedules
        `DELETE sc FROM Schedules sc LEFT JOIN (SELECT *, ROW_NUMBER() OVER (PARTITION BY ` +
        `block_id, subj_id ORDER BY block_id, subj_id) AS class_no FROM Schedules) temp ` +
        `ON sc.term_id = temp.term_id AND sc.subj_id = temp.subj_id AND sc.block_id = temp.block_id AND ` +
        `sc.day = temp.day AND sc.start = temp.start AND sc.end = temp.end AND sc.room_id = temp.room_id ` +
        `LEFT JOIN Preferences p ON sc.faculty_id = p.faculty_id LEFT JOIN Faculty f ON p.faculty_id = f.id ` +
        `INNER JOIN Departments d ON f.dept_id = d.id WHERE temp.class_no > 1 AND ` +
        `sc.term_id = '${currentTerm.id}' AND p.sched_status = 'open' AND d.chair_id = '${user.id}'` +
        (req.body.facultyID ? ` AND sc.faculty_id = '${req.body.facultyID}';` : ';') +

        // update assigned load
        `UPDATE Preferences p INNER JOIN Faculty f ON p.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id SET p.assigned_load = 0 WHERE p.term_id = '${currentTerm.id}' AND ` +
        `p.sched_status = 'open' AND d.chair_id = '${user.id}'` +
        (req.body.facultyID ? ` AND p.faculty_id = '${req.body.facultyID}';` : ';') +

        `UPDATE Schedules sc INNER JOIN Faculty f ON sc.faculty_id = f.id INNER JOIN Departments d ON ` +
        `f.dept_id = d.id SET sc.faculty_id = NULL, sc.room_id = NULL, sc.day = NULL, sc.start = NULL, ` +
        `sc.end = NULL, sc.mode = NULL WHERE sc.term_id = '${currentTerm.id}' AND d.chair_id = '${user.id}'` +
        (req.body.facultyID ? ` AND sc.faculty_id = '${req.body.facultyID}';` : ';')
    );

    next();
};

const deleteTermSchedule = async (req, res, next) => { };

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
    unsaveFacultySchedule, unpostFacultySchedules,
    resetSchedule, deleteTermSchedule
};
