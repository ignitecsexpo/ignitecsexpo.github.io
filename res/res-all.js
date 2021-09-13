console.log(stuDb)
const awardList = ["Division Best Project", "First Place Prize", "Second Place Prize", "Third Place Prize", "Honorable Mention"]
const tableList = ["result_table_best", "result_table_first", "result_table_second", "result_table_third", "result_table_honorable"]

for(var i = 0; i < stuDb.length; i++) {
	var student = stuDb[i];	
	var spaceIndex = student.name.indexOf(" ")
	var name = student.name.slice(0, spaceIndex + 2) + "."
	var projectTitle = student.project
	var award = awardList[student.prize]
	var table = tableList[student.prize]
	document.getElementById(table).innerHTML += 
		'<tr><td>' + name + '</td><td colspan="2">' + projectTitle + '</td><td>' + award + '</td></tr>'
}