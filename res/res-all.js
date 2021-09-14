const queryString = window.location.search;
console.log(queryString);
const urlParams = new URLSearchParams(queryString);
var group = urlParams.get('group');
console.log(group);

const awardList = ["Project of the Year", "First Place Prize", "Second Place Prize", "Third Place Prize", "Honorable Mention"];
const tableList = ["result_table_best", "result_table_first", "result_table_second", "result_table_third", "result_table_honorable"];
const statisticList = {
	'k-3': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total School</th><th scope="col">Grade K</th><th colspan="col">Grade 1</th><th scope="col">Grade 2</th><th scope="col">Grade 3</th></tr></thead>' + '<tr><td>101</td><td>39</td><td>11</td><td>25</td><td>26</td><td>39</td></tr>',
	'4-6': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total School</th><th scope="col">Grade 4</th><th colspan="col">Grade 5</th><th scope="col">Grade 6</th></tr></thead>' + '<tr><td>110</td><td>62</td><td>31</td><td>33</td><td>46</td></tr>',
}
const levelList = {
	'k-3': 'Grade K - 3',
	'4-6': 'Grade 4 - 6',
	//'7-8': stuDb7_8,
	//'9-12': stuDb9_12
}
const dbList = {
	'k-3': stuDbk_3,
	'4-6': stuDb4_6,
	//'7-8': stuDb7_8,
	//'9-12': stuDb9_12
}
var stuDb = dbList[group]
console.log(stuDb)
document.getElementById("gradeLevel").innerHTML = levelList[group]
document.getElementById("statistic_table").innerHTML = statisticList[group]

for(var i = 0; i < stuDb.length; i++) {
	var student = stuDb[i];	
	var spaceIndex = student.name.indexOf(" ");
	var name = student.name.slice(0, spaceIndex + 2) + ".";
	var projectTitle = student.project;
	var award = awardList[student.prize];
	var table = tableList[student.prize];
	document.getElementById(table).innerHTML += 
		'<tr><td>' + name + '</td><td colspan="2">' + projectTitle + '</td><td>' + award + '</td></tr>';
}

//file:///Users/angli/workspace/ignitecsexpo.github.io/awards.html?group=4-6