const getDepartments = (collegeID) => {
    return new Promise((resolve, reject) => {
        $.get("http://localhost:3000/api/departments/" + collegeID,
            (data, status) => {
                if (status == "success") {
                    resolve(data.departments);
                } else {
                    reject(data);
                }
            }, "json"
        );
    })
};

const getFaculty = (departmentID, columns) => {
    return new Promise((resolve, reject) => {
        $.get("http://localhost:3000/api/faculty/" + departmentID, { columns: columns },
            (data, status) => {
                resolve(data.faculty);
            }, "json"
        ).fail((data) => reject(data));
    });
}

const addDepartment = (collegeID, deptData) => {
    $.post(
        "http://localhost:3000/api/departments/" + collegeID, deptData,
        (data, status) => {
            console.log(data);
        },
        "text json"
    );
}

const addCollege = (name) => $.post(
    "http://localhost:3000/api/colleges", { name: name },
    (data, status) => {
        console.log(data);
    },
    "text json"
);

const updateChair = (deptID, chairperson) => {
    $.post(
        "http://localhost:3000/api/colleges/" + deptID, { chair: chairperson },
        (data, status) => {
            console.log(data);
        },
        "text json"
    );
}