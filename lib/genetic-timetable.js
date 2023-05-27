function shuffle(array) {
    const totalItems = array.length;
    for (let i = totalItems - 1; i >= 0; i--) {
        let r = Math.floor(Math.random() * totalItems);
        // swap current item and randomly selected item
        [array[i], array[r]] = [array[r], array[i]];
    }
    return array;
}

function assignClasses(classes, reqLoad) {
    const startIndex = Math.trunc(Math.random() * classes.length);
    let j = startIndex;
    let load = 0;
    let solution = [];
    while (load < reqLoad) {
        const { units } = classes[j];
        if (load + units <= reqLoad) {
            solution.push(classes[j]);
            load += classes[j].units;
        }

        j++;

        if (j >= classes.length) {
            j = 0;
        }

        if (j == startIndex) {
            break;
        }
    }
    return solution;
}

class FacultyLoading {
    members;
    reqLoad;
    reqHours;
    prefSubjs;

    constructor(reqLoad, reqHours, prefSubjs = [], classes = [], size = 1) {
        this.members = [];
        if (classes.length <= 0) {
            return console.log("No classes to assign.");
        }
        // initialize class permutations solution
        // shuffle classes
        const solClasses = classes.slice(0);
        shuffle(solClasses);

        for (let i = 0; i < size; i++) {
            let solution = assignClasses(solClasses, reqLoad);
            this.members.push(new ClassPerms(solution, prefSubjs));
        }
        this.reqLoad = reqLoad;
        this.reqHours = reqHours;
        this.prefSubjs = prefSubjs;
    }

    evolve(generations = 100, optimality = 0.8) {
        if (this.members.length <= 0) {
            return false;
        }
        let maxFitness = 0;
        const mostFitSolutions = [];
        while (generations >= 0 && maxFitness < optimality) {
            this.reproduce();
            const fitnesses = this.members.map(m => m.fitness(this.reqLoad, this.reqHours));
            maxFitness = Math.max(...fitnesses);
            const fitSolution = this.members[fitnesses.findIndex(f => f == maxFitness)];
            mostFitSolutions.push({ ...fitSolution, fitness: maxFitness });
            generations--;
        }

        const fitnesses = mostFitSolutions.map(m => m.fitness);
        maxFitness = Math.max(...fitnesses);
        const fittest = mostFitSolutions[fitnesses.findIndex(f => f == maxFitness)];
        
        return ({ ...fittest, fitness: maxFitness });
    }

    permSelection() {
        let matingPool = [];
        // const totalSols = this.members.length;
        for (let sol of this.members) {
            let fitness = Math.floor(sol.fitness(this.reqLoad, this.reqHours) * 100);
            for (let i = 0; i < fitness || i < 1; i++) {
                matingPool.push(sol);
            }
        }
        return matingPool;
    }

    reproduce() {
        const matingPool = this.permSelection();
        const { floor, random } = Math;

        for (let i = 0; i < this.members.length; i++) {
            const indexA = floor(random() * matingPool.length);
            const indexB = floor(random() * matingPool.length);

            let classA = matingPool[indexA];
            let classB = matingPool[indexB];

            let child = classA.crossover(classB, this.prefSubjs);
            this.members[i] = child;
        }
    }
}

class ClassPerms {
    classes;
    totalUnits;
    totalHours;
    totalPrefSubjs;

    constructor(classes, prefSubjs = []) {
        if (prefSubjs.length == 0) {
            prefSubjs = classes.map(c => c.subj);
        }
        this.classes = classes.sort((a, b) => a.units - b.units);

        const { totalUnits, totalHours, totalPrefSubjs } = this.classes.reduce(
            (acc, c) => {
                acc.totalUnits += c.units;
                acc.totalHours += c.hours;
                acc.totalPrefSubjs += prefSubjs.some(s => s == c.subj) ? 1 : 0;
                return acc;
            },
            { totalUnits: 0, totalHours: 0, totalPrefSubjs: 0 }
        );
        this.totalUnits = totalUnits;
        this.totalHours = totalHours;
        this.totalPrefSubjs = totalPrefSubjs;
    }

    fitness(reqLoad, reqHours) {
        const totalClasses = this.classes.length;
        const meanHours = reqHours / totalClasses;
        const totalHours = this.classes.reduce((hours, c) => hours + (c.units - meanHours) ** 2, 0);
        
        const hoursDeviation = Math.sqrt(totalHours / totalClasses);
        const loadAccuracy = 1 - Math.abs((this.totalUnits - reqLoad) / reqLoad);

        // give weights on the constraints
        const fitness = loadAccuracy * 0.20 + hoursDeviation / meanHours * 0.20 + this.totalPrefSubjs / totalClasses * 0.60;
        return fitness;
    }

    crossover(partner, prefSubjs) {
        // get average units in parents
        const aveUnits = (this.totalUnits + partner.totalUnits) / 2;
        const classes = [...new Set(this.classes.concat(partner.classes))];
        shuffle(classes);
        return new ClassPerms(assignClasses(classes, aveUnits), prefSubjs);
    }
}

const scheduleClasses = function (classes, rooms, days, openHours, clockIn, quantum) {
    classes = classes.slice(0);
    openHours *= 60;
    clockIn *= 60;
    quantum *= 60;

    const assignRooms = rooms;
    for (let r = 0; r < assignRooms.length; r++) {
        const { name, slots } = assignRooms[r];

        // separate classes into two arrays
        const { assignClasses, leftClasses } = classes.reduce((arr, c) => {
            arr[
                (!c.prefRooms || c.prefRooms.some(pr => name.includes(pr)) || c.prefRooms.length <= 0) 
                ? "assignClasses" : "leftClasses"
            ].push(c);
            return arr;
        }, { assignClasses: [], leftClasses: [] });
        
        classes = leftClasses;
        const nextDayClasses = [];

        // start with random day from 1 - 7
        const startDay = Math.trunc(Math.random() * days + 1);
        let c = 0, d = startDay;
        let start = clockIn;
        let end = clockIn;
        
        while (assignClasses.length > 0) {
            const { block, subj, units, prof, hours, partial } = assignClasses[c];
            const classMins = hours * 60;
            end = (classMins > quantum) ? start + quantum : start + classMins; // get time when class ends
            
            if (end > clockIn + openHours) { // cannot fit schedule
                start = clockIn;
                d = (d < days) ? d + 1 : 1;
                assignClasses.splice(c, 0, ...nextDayClasses);
                nextDayClasses.length = 0;
                
                if (d == startDay) {
                    break; // all days of the week are filled
                }
                
                continue;
            }

            // checks other rooms if block or prof is already assigned in same time
            // checks if current room is used
            let classConflict = assignRooms.some(({ id, slots }) => slots.some(rs => {
                let timeConflict = d == rs.day && (
                    (rs.start <= start && start < rs.end) || (rs.start < end && end <= rs.end) || 
                    (start <= rs.start && rs.start < end) || (start < rs.end && rs.end <= end)
                );
                return (rs.block == block || rs.prof == prof) && timeConflict || (timeConflict && id == assignRooms[r].id);
            }));

            if (!classConflict) {
                slots.push({ 
                    block: block, subj: subj, units: units, 
                    prof: prof, day: d, start: start, end: end, 
                    partial: partial || false 
                });
                assignClasses[c].hours = (classMins - (end - start)) / 60;
                start = end;
                if (assignClasses[c].hours > 0) {
                    const [preemptClass] = assignClasses.splice(c, 1);
                    nextDayClasses.push({...preemptClass, partial: true });
                } else {
                    assignClasses.splice(c, 1);
                }
                c = (c < assignClasses.length - 1) ? c + 1 : 0;
            } else if (c + 1 >= assignClasses.length) {
                start += 30; // move 30 mins. forward
                c = 0;
            } else {
                c += 1;
                continue;
            }

            if (start > clockIn + openHours) { // day schedule is filled
                start = clockIn;
                d = (d < days) ? d + 1 : 1;

                // put back next day classes in main classes array
                assignClasses.splice(c, 0, ...nextDayClasses); 
                nextDayClasses.length = 0;

                if (d == startDay) {
                    break; // all days of the week are filled
                }
            }
        }
        
        classes.push(...assignClasses);

        if (classes.length <= 0) {
            break;
        }

    }

    console.log("\nTotal classes left: " + classes.length);
    return assignRooms;
}

module.exports = { FacultyLoading, scheduleClasses };