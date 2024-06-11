
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
//Testing, leftovers & experimental code
/*
function getAllCSS() {
    let css = "";
    const styleTags = document.getElementsByTagName("style");

    for (let i = 0; i < styleTags.length; i++) {
        css += styleTags[i].innerHTML;
    }

    return css;
}
*/
/*
		const cssLinkId = "Tabulator-CSS";//+this.props.theme;
		//C:\ProgramData\Node-red\node_modules\node-red-dashboard-2-table-tabulator\node_modules\tabulator-tables\dist\css
		let cssFileURL = this.props.themeFile.trim();
		if (cssFileURL)
		{
			let link = document.querySelector("#"+cssLinkId)
			if (!link)
			{
				link = document.createElement("link");
				link.setAttribute("rel", "stylesheet");
				link.setAttribute("type", "text/css");
				link.setAttribute("id", cssLinkId);
				console.log(this.id+": Loading CSS file "+cssFileURL);
				link.setAttribute("href", cssFileURL);
				document.getElementsByTagName("head")[0].appendChild(link);
			}
		}
*/

/*
function findTable(tblId)
{
	if (!tblId)
	{
		alert("Cannot find table - no Id defined");
		return;
	}
	console.log("Looking for table Id "+tblId);

//	let p = document.getElementById(tblId);
//	console.log("Looking for table Id="+tblId,p);

	let tableObject = Tabulator.findTable("#"+tblId)[0];
	if (tableObject)
	{
		let count = tableObject.getDataCount();
		alert("Table "+tblId+" found with "+count+" rows");
	}
	else
		alert("Table "+tblId+" not found");
}
*/
//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
/*
//Vue.loadScript('C:/ProgramData/Node-red/WebRoot/omri.js');

    var scripts = [
      "https://cloudfront.net/js/jquery-3.4.1.min.js",
      "js/local.js"
    ];
    scripts.forEach(script => {
      let tag = document.createElement("script");
      tag.setAttribute("src", script);
      document.head.appendChild(tag);
    });
  }
      let tag = document.createElement("script");
      tag.setAttribute("src", '/NR_WebRoot/omri.js');
      document.head.appendChild(tag);

    mounted() {
        const scripts = [
            "js/script1.js",
            "js/script2.js"
        ];
        scripts.forEach(script => {
            let tag = document.head.querySelector(`[src="${ script }"`);
            if (!tag) {
                tag = document.createElement("script");
                tag.setAttribute("src", script);
                tag.setAttribute("type", 'text/javascript');
                document.head.appendChild(tag); 
            }
        });
*/
//const inlineScript = 'console.log("Hello from inline script!");';
//const inlineScript = 'function omri2() {return "Hello from omri2"}';
//const scriptElement = document.createElement('script');
//scriptElement.textContent = inlineScript;
//scriptElement.setAttribute("type", 'text/javascript');
//document.head.appendChild(scriptElement);

/*
function addMr(cell,formatterParams, onRendered)
{ return "Mr. "+cell.getValue()}

for (let i = 0; i < initObj.columns.length ; i++)
	if (initObj.columns[i].field === "text")
		initObj.columns[i].formatter = addMr;
*/

/* style
@import  "stylesheets/tabulator_midnight.min.css"

@import  "C:/ProgramData/Node-red/WebRoot/tabulator-tables/dist/css/tabulator.min.css";

.tabulator-table .tabulator-cell {
    color: #CC3A82;
    font-weight: bold;
}
*/

/*
.ui-tabulator-wrapper {
    padding: 10px;
    margin: 10px;
    border: 1px solid black;
}
.ui-tabulator-class {
    color: red;
    font-weight: bold;
}
*/
/*
<!--
    <table style="outline-width:#888 solid thin">
        <tr><th width="80px">mode</th><th width="80px">input</th><th width="80px">output</th></tr>
        <tr><td><center>scale</center></td><td><center>12</center></td><td><center>120</center></td></tr>
        <tr><td><center>limit</center></td><td><center>12</center></td><td><center>100</center></td></tr>
        <tr><td><center>wrap</center></td><td><center>12</center></td><td><center>20</center></td></tr>
        <tr><td><center>drop</center></td><td><center>12</center></td><td><center><i>(no output)</i></center></td></tr>
    </table>

<style>
	h4 {
	font-size: 80px;
	font-weight: bold;
	}
</style>

-->
*/