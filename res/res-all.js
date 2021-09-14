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
	'7-8': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total School</th><th scope="col">Grade 7</th><th colspan="col">Grade 8</th></tr></thead>' + '<tr><td>131</td><td>73</td><td>55</td><td>76</td></tr>',
	'9-12-ai': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total Schools</th><th scope="col">Grade 9</th><th colspan="col">Grade 10</th><th colspan="col">Grade 11</th><th colspan="col">Grade 12</th></tr></thead>' + '<tr><td>121</td><td>58</td><td>29</td><td>22</td><td>40</td><td>30</td></tr>',
	'9-12-game': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total Schools</th><th scope="col">Grade 9</th><th colspan="col">Grade 10</th><th colspan="col">Grade 11</th><th colspan="col">Grade 12</th></tr></thead>' + '<tr><td>160</td><td>77</td><td>58</td><td>32</td><td>40</td><td>30</td></tr>',
	'9-12-cyber': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total Schools</th><th scope="col">Grade 9</th><th colspan="col">Grade 10</th><th colspan="col">Grade 11</th><th colspan="col">Grade 12</th></tr></thead>' + '<tr><td>88</td><td>46</td><td>20</td><td>32</td><td>21</td><td>15</td></tr>',
	'9-12-mobile': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total Schools</th><th scope="col">Grade 9</th><th colspan="col">Grade 10</th><th colspan="col">Grade 11</th><th colspan="col">Grade 12</th></tr></thead>' + '<tr><td>109</td><td>68</td><td>31</td><td>52</td><td>16</td><td>20</td></tr>',
	'9-12-application': '<thead><tr class="table-success"><th scope="col">Total Participates</th><th scope="col">Total Schools</th><th scope="col">Grade 9</th><th colspan="col">Grade 10</th><th colspan="col">Grade 11</th><th colspan="col">Grade 12</th></tr></thead>' + '<tr><td>92</td><td>49</td><td>16</td><td>26</td><td>26</td><td>24</td></tr>',
}
const levelList = {
	'k-3': 'Grade K - 3',
	'4-6': 'Grade 4 - 6',
	'7-8': 'Grade 7 - 8',
	'9-12-ai': 'Grade 9 - 12\nAI, Data Science and Algorithm',
	'9-12-game': 'Grade 9 - 12\nGame Design',
	'9-12-cyber': 'Grade 9 - 12\nCyber Security',
	'9-12-mobile': 'Grade 9 - 12\nMoblie and Web',
	'9-12-application': 'Grade 9 - 12\nSystem Application'
}
const dbList = {
	'k-3': stuDbk_3,
	'4-6': stuDb4_6,
	'7-8': stuDb7_8,
	'9-12-ai': stuDb9_12_ai,
	'9-12-game': stuDb9_12_game,
	'9-12-cyber': stuDb9_12_cyber,
	'9-12-mobile': stuDb9_12_mobile,
	'9-12-application': stuDb9_12_application
}
var stuDb = dbList[group]
console.log(stuDb)
if (group == 'k-3' || group == '4-6' || group == '7-8') {
	console.log("Have best");
} else {
	var t = document.getElementById("best_project")
	t.style.display = "none";
}
document.getElementById("gradeLevel").innerHTML = levelList[group]
document.getElementById("statistic_table").innerHTML = statisticList[group]

for(var i = 0; i < stuDb.length; i++) {
	var student = stuDb[i];	
	var spaceIndex = student.name.lastIndexOf(" ");
	var name = student.name.slice(0, spaceIndex + 2) + ".";
	var projectTitle = student.project;
	var award = awardList[student.prize];
	var table = tableList[student.prize];
	document.getElementById(table).innerHTML += 
		'<tr><td>' + name + '</td><td colspan="2">' + projectTitle + '</td><td>' + award + '</td></tr>';
}
//file:///Users/angli/workspace/ignitecsexpo.github.io/awards.html?group=4-6