function validateScheduleInput() {
    const day = $("#class-day");
    const start = $("#class-start");
    const end = $("#class-end");
    const hours = $("#class-hours");
    const reqMinutes = parseFloat(hours.attr("aria-valuemax")) * 60;
    if (day.text() == "Pick Day" || !start.val() || !end.val()) {
        return -1;
    } else if (start.val() > end.val()) {
        return -2;
    }
    const startTime = roundMinutes(start.val(), 30);
    if (startTime < 7 * 60) {
        return -3;
    }
    
    const endTime = roundMinutes(end.val(), 30);
    if (endTime > 22 * 60) {
        return -4;
    } else if (endTime - startTime > reqMinutes) {
        return -5;
    }

    if (startTime == endTime) {
        return -6;
    }

    return {day: day.attr("aria-valuenow"), start: startTime, end: endTime};
}

function roundMinutes(time, nearestMinutes = 1) {
    let [hours, mins] = time.split(":");
    let toMins = parseInt(hours) * 60 + parseInt(mins);
    const rounded = Math.round(toMins / nearestMinutes) * nearestMinutes;
    const finalMins = rounded % 60;
    const finalHours = (rounded - finalMins);
    return finalHours + finalMins;
}

async function filterRooms(roomSearch) {
    const rooms = $("ul[aria-labelledby='class-room'] > li > .dropdown-item, #avail-rooms-alert").removeClass("disabled").hide().get();
    const totalRooms = Math.min(6, rooms.length);
    
    rooms.sort(
        (a, b) => b.textContent.localeCompare(roomSearch, undefined, {sensitivity:"accent"}) - a.textContent.localeCompare(roomSearch, undefined, {sensitivity:"accent"})
    );
    
    const validTime = validateScheduleInput();
    switch (true) {
        case validTime == -1:
            $("#avail-rooms-alert").text("Missing day, start and/or end time").show();
            setTimeout(() => {
                $("#class-start").trigger("focus");
                $("#avail-rooms-alert").fadeOut();
            }, 2000);
            return;
        case validTime == -2:
            $("#avail-rooms-alert").text("End time is earlier than start time").show();
            setTimeout(() => {
                $("#class-start").trigger("focus");
                $("#avail-rooms-alert").fadeOut();
            }, 2000);
            return;
        case validTime == -3:
            $("#avail-rooms-alert").text("Class must start on or later than 7AM").show();
            setTimeout(() => {
                $("#class-start").trigger("focus");
                $("#avail-rooms-alert").fadeOut();
            }, 2000);
            return;
        case validTime == -4:
            $("#avail-rooms-alert").text("Class must end on or before than 10PM").show();
            setTimeout(() => {
                $("#class-start").trigger("focus");
                $("#avail-rooms-alert").fadeOut();
            }, 2000);
            return;
    }
    
    try {
        let conflictRooms = await getConflictRooms(validTime);
        // disable rooms taken at the time
        rooms.filter((r) => conflictRooms.includes(r.getAttribute("itemid"))).map(r => r.classList.add("disabled"));
    } catch (error) {
        console.log(error);
        if (error && error.message) {
            $("#avail-rooms-alert").text(error.message).show();
            setTimeout(() => {
                $("#avail-rooms-alert").fadeOut();
                $("#class-start").trigger("focus");
            }, 2000);
        } else {
            $("#avail-rooms-alert").text("Could not filter availability").show();
            setTimeout(() => {
                rooms.splice(totalRooms, rooms.length - totalRooms);
                $(rooms).show();
                $("#avail-rooms-alert").fadeOut();
            }, 2000);
        }
        return;
    }

    rooms.splice(totalRooms, rooms.length - totalRooms);

    $(rooms).show();
}