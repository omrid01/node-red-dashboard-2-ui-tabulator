<template>
    <!-- Component must be wrapped in a block so props such as className and style can be passed in from parent    -->
    <div className="ui-tabulator-wrapper">
		<div ref="tabulatorDiv"></div>
		<!-- Has DS image: {{tblHasDSImage}}, Multi-user: {{props.multiUser}}  -->
    </div>
 </template>

<script>
import {TabulatorFull as Tabulator} from 'tabulator-tables';
import { markRaw } from 'vue'
import { mapState } from 'vuex'

export default {
    name: 'UITabulator',
    inject: ['$socket'],
    props: {
        /* do not remove entries from this - Dashboard's Layout Manager's will pass this data to your component */
        id: { type: String, required: true },
        props: { type: Object, default: () => ({}) },
        state: { type: Object, default: () => ({ enabled: false, visible: false }) }
    },
    setup (props) {
        console.info('UITabulator setup with:', props)
        console.debug('Vue function loaded correctly', markRaw)
    },
    computed: {
        ...mapState('data', ['messages'])
    },
//******************************************************************************************************************************************
    data () {
        return {
            vuetifyStyles: [
                { label: 'Responsive Displays', url: 'https://vuetifyjs.com/en/styles/display/#display' },
                { label: 'Flex', url: 'https://vuetifyjs.com/en/styles/flex/' },
                { label: 'Spacing', url: 'https://vuetifyjs.com/en/styles/spacing/#how-it-works' },
                { label: 'Text & Typography', url: 'https://vuetifyjs.com/en/styles/text-and-typography/#typography' }
            ],
			// Table properties
			tbl: 		 	null,	// Table object
			tblReady:	 	false,	// Indicates that table has completed initializing
			tblId: 		 	"",		// Optional div Id, to allow dynamic CSS injection or access to the table object from other template nodes, via Tabulator.findTable()
			tblHasDSImage:	false,	// Indicates if there is a datastore image for the table (relevant in shared mode only)
			tblConfig:	 	null,	// Current (active) table configuration (excluding data)
			tblStyleMap: 	null, 	// The styles assigned to the table (via the tbSetStyle command)
			rowIdField: 	"id"	// The name of the field which holds the unique row Id (the default is 'id', but can be overriden)

			,initCount: 0	// temporary counter (working around a dash-2 bug) for 'widget-load' events
		}
    },
//******************************************************************************************************************************************
    mounted () {
		var $widgetScope = this; // Save the 'this' scope for socket listener, callbacks, external functions etc.
		this.initCount = 0;
		
		window.tbPrintToLog = this.props.printToLog;
		console.log(`***ui-tabulator node ${this.id} mounted on client ${this.$socket.id}, debug=${window.tbPrintToLog?"on":"off"}`);

		// Load CSS theme
		if (this.props.themeCSS)
			loadThemeCSS(this.props.themeCSS,this);

		// set msg listener
        this.$socket.on('msg-input:' + this.id, (msg) => {
			if (!msg)
				return;

// ************** Temp workaround - forcing client reload (due to NR framework bug)  ***********************************************
			if (msg.tbCmd === "tbReloadClient")
			{
				console.log($widgetScope.id+": Received reload request");
				if (window.tbPrintToLog)
					$widgetScope.$socket.emit('widget-action', $widgetScope.id,{payload:`${$widgetScope.id}: self-reloading`});
				setTimeout(()=>location.reload(),100);
				return;
			}
// *********************************************************************************************************************************

			// Special utility msg for testing client/server connections - should always go to all clients
			if (msg.tbCmd === "tbTestConnection")
			{
				processMsg(msg,$widgetScope);
				return;
			}
			
			// --------  Determine scope and process msg    ------------------------------------------------------------------------------------
			let msgClientId = msg.hasOwnProperty("_client") && msg._client.socketId ? msg._client.socketId : "";

			// Check if msg includes a specified client scope
			if (msg.hasOwnProperty("tbClientScope"))
			{
				switch (msg.tbClientScope)
				{
					case "tbAllClients":
						processMsg(msg,$widgetScope);
						return;
					case "tbOriginator":
						if (msgClientId && msgClientId === $widgetScope.$socket.id)
						{
							debugLog("Processing message sent by own client");
							processMsg(msg,$widgetScope);
						}
						return;
					case "tbNotOriginator":
						if (msgClientId && msgClientId !== $widgetScope.$socket.id)
						{
							debugLog("Processing message sent by another client");
							processMsg(msg,$widgetScope);
						}
						return;
				}
			}

			// Handle messages if no client Id or this client Id
			if (!msgClientId || msgClientId === $widgetScope.$socket.id)
				processMsg(msg,$widgetScope);
			else if (msg.multiUserPassThru === true)	// Hidden option (for testing purposes) to forward rejected messages from another client without processing them
			{
				msg.payload = "Ignored";
				$widgetScope.send(msg);
			}
		});

        // tell Node-RED that we're loading a new instance of this widget
        this.$socket.emit('widget-load', this.id)
		
		// Triggered when the widget loads there is data for this node in the Node-RED datastore
		this.$socket.on('widget-load:' + this.id, (msg) => {
			const dsDummyImage = "dummyDSImage";

			// Temp workaround for multi-notifications bug 
			this.initCount++;
			console.log(`${this.id}/widget-load: Datastore=${msg===dsDummyImage?'dummy':'image'},Count=${this.initCount},ts=${Date.now()}${this.initCount >1?"-->Ignoring":""}`);
			if (this.initCount > 1)
				return;
			
			if (!msg || msg === "dummyDSImage")
			{
				debugLog(this.id+": creating table from node configuration");
				let initObj = parseTblConfig(this.props.initObj);
				if (initObj !== null)
					createTable(initObj,$widgetScope,null,null,false);
			}
			else
			{
				debugLog(this.id+": creating table from datastore image");
				this.tblHasDSImage = true;
				createTblFromDatastore(msg,this);
			}
        })
    },
//******************************************************************************************************************************************
    unmounted () {
		destroyTable(this,null);

        /* Make sure, any events you subscribe to on SocketIO are unsubscribed to here */
        this.$socket?.off('widget-load' + this.id)
        this.$socket?.off('msg-input:' + this.id)
    },
//******************************************************************************************************************************************
    methods: {
        //  widget-action just sends a msg to Node-RED, it does not store the msg state server-side
        //  alternatively, you can use widget-change, which will also store the msg in the Node's datastore
		
		send(msg) {
			// this.$socket.emit('widget-action', this.id, msg)
			
			// Instead of widget-action, we send the message as a custom event to the server, allowing it to filter duplicate messages
			//(from multiple clients, in shared mode) before forwarding
			if (!msg.tbDoNotReply)
				this.$socket.emit('tbSendMessage'+this.id, this.id, msg)
        },
		sendClientCommand(cmd,msg) {
            msg.tbClientCmd = cmd;
            this.$socket.emit('tbClientCommands'+this.id, this.id, msg)
        },
		saveToDatastore(exists,config,data,styleMap,saveId)	{
			let dsMsg = {};
            dsMsg.tbClientCmd = 'tbSaveToDatastore';
			dsMsg.saveId = saveId;
			dsMsg.payload = {
				timestamp: Date.now(),
				saveId: saveId,
				exists: exists,
				config: config,	// null = use default configuration as defined in the node
				data:   data,
				styleMap: styleMap
			}
			this.tblHasDSImage = true;
            this.$socket.emit('tbClientCommands'+this.id, this.id, dsMsg)
 		},
		clearDatastore(setDummy,msgId)
		{
			let dsMsg = {};
            dsMsg.tbClientCmd = 'tbClearDatastore';
			dsMsg.clientMsgId = msgId;
			dsMsg.setDummy = setDummy ? true : false;
			this.tblHasDSImage = false;
            this.$socket.emit('tbClientCommands'+this.id, this.id, dsMsg)
		},
		showDatastore(sendMsg,msgId)
		{
			let dsMsg = {};
            dsMsg.tbClientCmd = 'tbShowDatastore';
			dsMsg.clientMsgId = msgId;
			dsMsg.sendMsg = sendMsg;
            this.$socket.emit('tbClientCommands'+this.id, this.id, dsMsg)
		}
	}
}
// ******************************************************************************************************************************************
// My functions
// ******************************************************************************************************************************************
function processMsg(msg,$widgetScope)
{
	delete msg.error;
	let cmd = msg.tbCmd;
	//------------------------------------------------------------------
	// Node commands
	//------------------------------------------------------------------
	switch (cmd)
	{
		case "tbCreateTable":
			debugLog($widgetScope.id+": creating table from msg");
			createTable(msg.tbInitObj,$widgetScope,msg,null,true);
			return; 
		case "tbResetTable":
			if (!$widgetScope.props.multiUser)  // Clear datastore
				$widgetScope.clearDatastore(true,msg._msgid);
			let initObj = parseTblConfig($widgetScope.props.initObj);
			if (initObj !== null)
			{
				debugLog($widgetScope.id+": resetting table from node configuration");
				createTable(initObj,$widgetScope,msg,null,false);
			}
			return;
		case "tbClearStyles":
			if (!$widgetScope.tbl)
				return;
			$widgetScope.tblStyleMap = null;
			let data = $widgetScope.tbl.getData();

			if (!$widgetScope.props.multiUser && $widgetScope.tblHasDSImage)
				$widgetScope.saveToDatastore(true,$widgetScope.tblConfig,data,null,msg._msgid);
			
			debugLog($widgetScope.id+": refreshing table with current config & data");
			let cfg = cloneObj($widgetScope.tblConfig);
			cfg.data = data;
			createTable(cfg,$widgetScope,msg,null,false);
			return;
		case "tbCellEditSync":	// internal command notifying an in-cell edit in another client
			cellEditSync($widgetScope,msg);
			return; 
		// Undocumented utility/testing commands
		//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
		case "tbTestConnection":
			msg.payload = "Test Connection";
			msg.serverNodeId = $widgetScope.id;
			msg.clientId = $widgetScope.$socket.id;
			if (!msg.listener)
				msg.listener = 'tbClientCommands';
			switch (msg.listener)
			{
				case 'widget-action':
					$widgetScope.$socket.emit('widget-action', $widgetScope.id, msg)
					break;
				case 'tbSendMessage':
					$widgetScope.$socket.emit('tbSendMessage'+$widgetScope.id, $widgetScope.id, msg)
					break;
				case 'tbClientCommands':
					msg.tbClientCmd = 'tbTestConnection';
					$widgetScope.$socket.emit('tbClientCommands'+$widgetScope.id, $widgetScope.id, msg)
			}
			console.log("Sent connection test ping to listener "+msg.listener);
			return; 
		case 'tbShowDatastore':
			$widgetScope.showDatastore((msg.sendMsg ? true : false),msg._msgid);
			return; 
		case "tbClearDatastore":	// **for internal use or testing only**
			$widgetScope.clearDatastore(true,msg._msgid);
			return; 
		case 'tbSaveToDatastore':  // **for testing only**
			if (!$widgetScope.tbl)
				$widgetScope.saveToDatastore(false,null,null,null,msg._msgid);
			else
				$widgetScope.saveToDatastore(true,$widgetScope.tblConfig,$widgetScope.tbl.getData(),$widgetScope.tblStyleMap,msg._msgid);
			return; 
		case "tbSetTableId":	// internal command to set an Id to the table's HTML Div, to allow direct API access from external nodes
			let divId = msg.tbTableId ? msg.tbTableId.trim() : "";
			if (divId === "" || divId.match(/^[a-zA-Z_-][a-zA-Z0-9_-]*$/) !== null)
			{
				$widgetScope.tblId = divId;
				$widgetScope.$refs.tabulatorDiv.id = divId;
			}
			else
				msg.error = "Invalid Table Id";
			$widgetScope.send(msg);
			return; 
	}
	//------------------------------------------------------------------
	// Table commands (accepted only when table is built & ready)
	//------------------------------------------------------------------
	if (!$widgetScope.tblReady)
	{
		msg.error = 'Table does not exist';
		$widgetScope.send(msg);
		return;
	}
	switch (cmd)
	{
		//------------------------------------------------------------------
		// Node functions
		//------------------------------------------------------------------
		case "tbDestroyTable":
		case "destroy":  // Overloads Tabulator.destroy(), to enable graceful cleanup
			destroyTable($widgetScope,msg);
			if (!$widgetScope.props.multiUser)
				$widgetScope.saveToDatastore(false,null,null,null,msg._msgid);
			return; 
		case "tbSetStyle":
			setStyle(msg.tbScope,msg.tbStyles,$widgetScope,msg);
			return; 
		//------------------------------------------------------------------
		// Managed Tabulator API calls
		//------------------------------------------------------------------
		// Data-changing commands - called Async
		//------------------------------------------------------------------
		case "updateRow":
		case "updateOrAddRow":
			tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);	// response is sent in a callback
			return;
		case "setData":
		case "replaceData":
		case "updateData":
		case "updateOrAddData":
			if (!checkRowIds(msg.tbArgs[0],$widgetScope.rowIdField))
			{
				msg.error = "Duplicate or invalid row Id's";
				$widgetScope.send(msg);
			}
			else
				tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);	// response is sent in a callback
			return;
		case "addData":
			if (!checkRowIds(msg.tbArgs[0],$widgetScope.rowIdField) || !checkAddedRows(msg.tbArgs[0],$widgetScope))
			{
				msg.error = "Duplicate or invalid row Id's";
				$widgetScope.send(msg);
			}
			else
				tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);	// response is sent in a callback
			return;
		case "addRow":
			if (!checkAddedRows([msg.tbArgs[0]],$widgetScope))
			{
				msg.error = "Duplicate or invalid row Id";
				$widgetScope.send(msg);
			}
			else
				tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);	// response is sent in a callback
			return;
		case "deleteRow":
			tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);	// response is sent in a callback
			return;
		//------------------------------------------------------------------
		// Data-changing commands - called Sync
		//------------------------------------------------------------------
		case "clearData":
			tabulatorSyncAPI(cmd,msg.tbArgs,msg,$widgetScope);
			updateAndRespond(msg,$widgetScope);
			return;
		//------------------------------------------------------------------
		// Read-only commands (void or returning data) - called sync
		//------------------------------------------------------------------
		case "getData":
		case "getDataCount":
		case "searchData":
		case "getSelectedData":
		case "getFilters":

		case "showColumn":
		case "hideColumn":
		case "setSort":
		case "selectRow":
		case "deselectRow":
		case "setFilter":
		case "addFilter":
		case "removeFilter":
		case "clearFilter":
		case "download":
			tabulatorSyncAPI(cmd,msg.tbArgs,msg,$widgetScope);
			$widgetScope.send(msg);
			return;
		//------------------------------------------------------------------------------
		// Read-only commands (returning data) - called sync with special result parsing
		//------------------------------------------------------------------------------
		case "getRow":
			tabulatorSyncAPI(cmd,msg.tbArgs,msg,$widgetScope,function(retObj,msg){  // applies parser func on returned row component
				if (retObj)	// Here it is a row component
					msg.payload = retObj.getData()
				else
					msg.error = "Invalid Row Id";
			});
			$widgetScope.send(msg);
			return;
		default:
		//------------------------------------------------------------------
		// Freehand (unmanaged) API call
		//------------------------------------------------------------------
			if (!cmd || typeof $widgetScope.tbl[cmd] !== "function")
			{
				msg.error = "Missing or invalid command";
				$widgetScope.send(msg);
				return;
			}
			tabulatorFreehandAPI(cmd,msg.tbArgs,msg,$widgetScope);  //send response happens inside
			return;
	}
}
function updateAndRespond(msg,$widgetScope)
{
	if (!$widgetScope.props.multiUser)
	{
		// Update style map, if needed
		let map = $widgetScope.tblStyleMap;
		if (map)
		{
			let tbl = $widgetScope.tbl;
			let	rowIdField = $widgetScope.rowIdField;

			switch (msg.tbCmd)
			{
				case "setData":
				case "replaceData":
				//case "updateData": - nothing to do here
				case "addData":
				case "updateOrAddData":
					if (map.rows.length > 0)
					{
						let data = tbl.getData();
						map.rows = map.rows.filter((row) => {		// keep only row-style objects of rows which exists in the new data
							let found = data.find((e) => e[rowIdField] == row.rowId);  // not ===
							//console.log("row",row.rowId,found ? " found" : " not found");
							return found ? true : false;
						});
					}
					applyFromStyleMap(map,tbl);
					break;
				case "addRow":
				// case "updateRow": - nothing to do here
				case "updateOrAddRow":
					//rowId = msg.tbArgs[0][rowIdField];
					//if (rowId && map.tblStyles)
					if (map.tblStyles)
						applyFromStyleMap(map,tbl)
					break;
				case "deleteRow":
					let rowId = msg.tbArgs[0];
					map.rows = map.rows.filter((row) => row.rowId != rowId); // not !==
					break;
				case "clearData":
					map.rows = [];
					break;
			}
		}
		$widgetScope.saveToDatastore(true,$widgetScope.tblConfig,$widgetScope.tbl.getData(),$widgetScope.tblStyleMap,msg._msgid);
	}
	$widgetScope.send(msg);
}
function createTable(initObj,$widgetScope,msg,styleMap,saveToDS)
{
	//---------------------------------------------------------------------------------------------------------
	// (msg !== null) indicates table creation per user command (as opposed to startup), and returns a response
	//---------------------------------------------------------------------------------------------------------
	if (!initObj || JSON.stringify(initObj) === '{}')	// if empty initialization object --> return without creating a new table
	{
		destroyTable($widgetScope,null);  // destroy current table (if exists)
		if (!$widgetScope.props.multiUser && saveToDS)
			$widgetScope.saveToDatastore(false,null,null,null,msg._msgid);
		if (msg)
		{
			msg.payload = "No Table defined";
			$widgetScope.send(msg);
		}
		return;
	}

	destroyTable($widgetScope,null);  // destroy current table (if exists)
	// Create a new table
	try  
	{
		$widgetScope.tbl = new Tabulator($widgetScope.$refs.tabulatorDiv, initObj);
		
			// console.log("Table created");
			// $widgetScope.send({payload:"Table created"});
		
		// Table creation is asynchronous. The setup resumes after the table finished initializing, in the below "TableBuilt" callback
		//-----------------------------------------------------------------------------------------------------------------------
		$widgetScope.tbl.on("tableBuilt", function()    {
			$widgetScope.tblReady = true;

			$widgetScope.tblConfig = cloneObj(initObj);
			delete $widgetScope.tblConfig.data;
			if (styleMap)
				$widgetScope.tblStyleMap = cloneObj(styleMap);
			else
				//$widgetScope.tblStyleMap = new tbStyleMap();
				$widgetScope.tblStyleMap = null;
			
			if (initObj.hasOwnProperty("index"))	// overriding the default 'id' field as the row identifier
				$widgetScope.rowIdField = initObj.index;
			
			// Set notifications for the selected events 
			setEventNotifications($widgetScope);

			if (styleMap)
				applyFromStyleMap(styleMap,$widgetScope.tbl)

			if ($widgetScope.props.events.includes("tableBuilt"))	// when explicitely specified, sends an event with table data (as defined in init object)
			{
				let eventMsg = new tbEventMsg("tableBuilt",$widgetScope.$socket.id);
				eventMsg.payload = "Table built and ready, for client "+$widgetScope.$socket.id;
				$widgetScope.send(eventMsg);
			}

			if (!$widgetScope.props.multiUser && saveToDS)
			{
				let data = initObj.data || [];
				$widgetScope.saveToDatastore(true,$widgetScope.tblConfig,data,$widgetScope.tblStyleMap,msg._msgid);
			}
			console.log($widgetScope.id+": Table built and ready");
			if (msg)
			{
				msg.payload = "Table built and ready";
				$widgetScope.send(msg);
			}
		});  // on TableBuilt
	}
	catch (err)
	{
		console.error($widgetScope.id+": Table creation failed",err);
		$widgetScope.tbl = null;
		$widgetScope.tblReady = false;
		if (!$widgetScope.props.multiUser && saveToDS)
			$widgetScope.saveToDatastore(false,null,null,null,msg._msgid);
		if (msg)
		{
			msg.payload = "Table creation failed";
			msg.error = err.message;
			$widgetScope.send(msg);
		}
	}	
}
function createTblFromDatastore(dsImage,$widgetScope)
{
	if (!dsImage.exists)  // stored image = 'no table' (not to confuse with 'no stored image')
	{
		destroyTable($widgetScope,null);
		return;
	}
	let initObj;
	if (dsImage.config)  // Stored image includes table configuration
		initObj = dsImage.config;
	else
	{
		initObj = parseTblConfig($widgetScope.props.initObj);
		delete initObj.data;
	}
	if (dsImage.data)
		initObj.data = dsImage.data;

	createTable(initObj,$widgetScope,null,dsImage.styleMap,false);
}
function destroyTable($widgetScope,msg)
{
	if ($widgetScope.tbl)
	{
		$widgetScope.tbl.clearData();
		$widgetScope.tbl.destroy();
		console.log($widgetScope.id+": Table destroyed");
	}
	$widgetScope.tbl = null;
	$widgetScope.tblReady = false;
	$widgetScope.tblConfig = null;
	$widgetScope.tblStyleMap = null;

	if (msg)
		$widgetScope.send(msg);
}
function setStyle(scope,styles,$widgetScope,msg)
{
/*
if (no rowId) ==> all rows in table. Ignoring field
else if (rowId === "tbHeader")
	if (field) ==> single column header
	else	   ==> all column header
else 
	if (field) ==> single cell
	else  	   ==> whole row
*/
	let rowId = scope.hasOwnProperty("rowId") ? scope.rowId : null;
	let field = scope.field || "";
	const hdrRowId = "tbHeader";
	
	try  {
		if (rowId === undefined || rowId === null)	// Table scope: apply to all rows
		{
			let rowComponents = $widgetScope.tbl.getRows();
			for (let i = 0; i < rowComponents.length ; i++)
			{
				let element = rowComponents[i].getElement();
				applyStyles(element,styles);
			}
		}
		else if (rowId === hdrRowId)  // Header 
		{
			if (field)	// scope = single column header
			{
				let colComponent = $widgetScope.tbl.getColumn(field);
				let element = colComponent.getElement();
				applyStyles(element,styles);
			}
			else	// scope = all column headers
			{
				let hdrCells = $widgetScope.tbl.getColumns();
				for (let i = 0; i < hdrCells.length ; i++)
				{
					let element = hdrCells[i].getElement();
					applyStyles(element,styles);
				}
			}
		}
		else	// single row or cell
		{
			let rowComponent = $widgetScope.tbl.getRow(rowId);
			if (!rowComponent)
				msg.error = "Invalid row Id";
			else
			{
				if (field)	// ==>scope = single cell
				{
					let cellComponent = rowComponent.getCell(field);
					if (!cellComponent)
						msg.error = "Invalid field (column) name";
					else
					{
						let element = cellComponent.getElement();
						applyStyles(element,styles);
					}
				}
				else  // full row
				{
					let element = rowComponent.getElement();
					applyStyles(element,styles);
				}
			}
		}
	}
	catch  (err) {
		msg.error = err.message;
	}
	if (!msg.hasOwnProperty("error") && !$widgetScope.props.multiUser)
	{
		updateStyleMap($widgetScope,rowId,field,styles);
		let data = $widgetScope.tbl.getData();
		$widgetScope.saveToDatastore(true,$widgetScope.tblConfig,data,$widgetScope.tblStyleMap,msg._msgid);
	}
	$widgetScope.send(msg);
}
function applyStyles(element,styles)
{
	// example: cellObj.getElement().style.backgroundColor = "cyan";
	for (const prop in styles)
	{
		if (element.style.hasOwnProperty(prop))
			element.style[prop] = styles[prop];
	}		
}
function updateStyleMap($widgetScope,rowId,field,styles)
{
/*
if (no rowId) ==> all rows in table. Ignoring field
else if (rowId === "tbHeader")
	if (field) ==> single column header
	else	   ==> all column header
else 
	if (field) ==> single cell
	else  	   ==> whole row
*/
	if (!$widgetScope.tblStyleMap)
		$widgetScope.tblStyleMap = new tbStyleMap();
	let map = $widgetScope.tblStyleMap;
	const hdrRowId = "tbHeader";
	
	if (rowId === undefined || rowId === null)	// Table scope
	{
		if (map.tblStyles)
			for (const prop in styles)  // merge styles
				map.tblStyles[prop] = styles[prop];
		else
			map.tblStyles = cloneObj(styles);
	}
	else if (rowId === hdrRowId)  // header
	{
		if (!map.hdrStyles)
			map.hdrStyles = {};
		if (field)	// single header
		{
			if (map.hdrStyles.hasOwnProperty(field))
				for (const prop in styles)  // merge styles
					map.hdrStyles[field][prop] = styles[prop];
			else
				map.hdrStyles[field] = cloneObj(styles);
		}
		else	// all headers
		{
			let hdrCells = $widgetScope.tbl.getColumns();
			for (let i = 0; i < hdrCells.length ; i++)
			{
				let colName = hdrCells[i].getField();
				if (map.hdrStyles.hasOwnProperty(colName))
					for (const prop in styles)  // merge styles
						map.hdrStyles[colName][prop] = styles[prop];
				else
					map.hdrStyles[colName] = cloneObj(styles);
			}
		}
	}
	else	// single row or cell
	{
		let rowObj = map.rows.find((obj)=> obj.rowId == rowId);  // not ===
		if (!rowObj)
		{
			rowObj = new tbStyleMapRow(rowId);
			map.rows.push(rowObj);
		}
		if (field)  // single cell
		{
			if (rowObj.cells.hasOwnProperty(field))
			{
				for (const prop in styles)  // merge styles
					rowObj.cells[field][prop] = styles[prop];
			}
			else
				rowObj.cells[field] = cloneObj(styles);
		}
		else  // whole row
		{
			if (rowObj.rowStyles)
			{
				for (const prop in styles)
					rowObj.rowStyles[prop] = styles[prop];
			}
			else
				rowObj.rowStyles = cloneObj(styles);
		}
	}
}
function applyFromStyleMap(map,tbl)
{
	// first apply table-level styles
    if (map.tblStyles)
	{
		let rowComponents = tbl.getRows();
		for (let i = 0; i < rowComponents.length ; i++)
		{
			let element = rowComponents[i].getElement();
			applyStyles(element,map.tblStyles);
		}
	}
	// Now apply to header row
	if (map.hdrStyles)
	{
		if (map.hdrStyles)
			for (const field in map.hdrStyles)
			{
				let colComponent = tbl.getColumn(field);
				let element = colComponent.getElement();
				applyStyles(element,map.hdrStyles[field]);
			}
	}
	// now apply to rows, and cells within them
	for (let i = 0 ; i < map.rows.length ; i++)
	{
		let rowComponent = tbl.getRow(map.rows[i].rowId);
		if (rowComponent)
		{
			// apply row-level styles
			if (map.rows[i].rowStyles)
			{
				let element = rowComponent.getElement();
				applyStyles(element,map.rows[i].rowStyles);
			}
			// now apply cell styles
			for (const field in map.rows[i].cells)
			{
				let cellComponent = rowComponent.getCell(field);
				let element = cellComponent.getElement();
				applyStyles(element,map.rows[i].cells[field]);
			}
		}
	}
}
function cellEditSync($widgetScope,msg)
{
	debugLog("processing sync message on cell-edit in another client");
		
	let data = {};
	let rowIdField = $widgetScope.rowIdField;
	data[rowIdField] = msg.payload[rowIdField];
	data[msg.payload.field] = msg.payload.value;
	try  {
		$widgetScope.tbl.updateData([data]);
	}
	catch (err)  {
		console.error($widgetScope.id+": Cell-edit sync failed:",err.message);
	}
	// Not sending a response msg to the flow, since this is an internal sync message
}
// ******** Tabulator API calls (Async, Sync, Auto) **************************************
function tabulatorAsyncAPI(cmd,cmdArgs,msg,$widgetScope,successPostFunc,errorPostFunc)
{
	debugLog("Calling '"+cmd+"', API mode=Async");
	let args = cmdArgs ? cloneObj(cmdArgs) : [];	// for some reason, sometime it doesn't work with the original args object

	$widgetScope.tbl[cmd](...args)
		.then(function(xxx){
			if (successPostFunc)
				successPostFunc();
			updateAndRespond(msg,$widgetScope);
		})
		.catch(function(err){
			msg.error = err;
			if (errorPostFunc)
					errorPostFunc();
			updateAndRespond(msg,$widgetScope);	// update Datastore even upon error, as cmd may have been applied partially
		});
}
function tabulatorSyncAPI(cmd,cmdArgs,msg,$widgetScope,parserFunc)
{
	debugLog("Calling '"+cmd+"', API mode=Sync");
	let args = cmdArgs ? cloneObj(cmdArgs) : [];	// for some reason, sometime it doesn't work with the original args object
	
	try  {
		let data = $widgetScope.tbl[cmd](...args);
		if (parserFunc)
			parserFunc(data,msg);
		else
			if (data !== undefined && data !== null)
				msg.payload = data;
	}
	catch (err) {
		msg.error = err.message;
	}
}
function tabulatorFreehandAPI(cmd,cmdArgs,msg,$widgetScope)
{
	debugLog("Calling '"+cmd+"', API mode=Freehand");
	let args = cmdArgs ? cloneObj(cmdArgs) : [];	// for some reason, sometime it doesn't work with the original args object

	// Execute the command in a way which supports both sync and async
	let response = $widgetScope.tbl[cmd](...args)

	let isPromise = !!response && typeof response === 'object' && typeof response.then === 'function';
	if (isPromise)
	{
		let result = Promise.resolve(response)
			.then((result)=> {
					$widgetScope.send(msg);
				})
			.catch((err)=> {
					msg.error = err;
					$widgetScope.send(msg);
				})
	}
	else
	{
		if (response !== undefined && response !== null)
			// Validate that the returned data is sendable in a msg
			if (isSendable(response))
				msg.payload = response;
			else
				msg.error = "API response cannot be serialized to a msg";
		$widgetScope.send(msg);
	}
}
function isSendable(obj)
{
	try  {
		let x = JSON.stringify(obj)
		return true;		
	}
	catch (err)  {
		// obj does not have a 'toJSON' function
		return false;
	}
}
function setEventNotifications($widgetScope)
{
	let eventStr = $widgetScope.props.events;
	let eventArr = eventStr.split(',');
	
	// If required for client sync, force cell-edit notifications
	if (!$widgetScope.props.multiUser && !$widgetScope.props.events.includes("cellEdited"))
		eventArr.push("cellEdited");

	for (let i = 0 ; i < eventArr.length ; i++)
	{
		let ev = eventArr[i].trim();
		if (!ev)
			continue;
		switch (ev)
		{
			case "tableBuilt":	// Listener is set automatically during createTable(). If also explicitly set in the events list, it will also issue a notification from there
				break;
		//-------------------------------------------------------
		// Row events
		//-------------------------------------------------------
			case "rowClick":
				$widgetScope.tbl.on(ev, function(e, row){  //e = the mouse event object , row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowDblClick":
				$widgetScope.tbl.on(ev, function(e, row){  //e = the mouse event object , row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					//debugLog("Sending event",eventMsg);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowTap":
				$widgetScope.tbl.on(ev, function(e, row){  //e = the mouse event object , row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowDblTap":
				$widgetScope.tbl.on(ev, function(e, row){  //e = the mouse event object , row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowTapHold":
				$widgetScope.tbl.on(ev, function(e, row){  //e = the mouse event object , row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowAdded":  	// sent upon addRow, updateOrAddRow, addData or updateOrAddData
				$widgetScope.tbl.on(ev, function(row){	// row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowUpdated":	// sent only upon programmatic data update (updateRow, updateOrAddRow, updateData or updateOrAddData), not in-cell edits
				$widgetScope.tbl.on(ev, function(row){	// row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowDeleted": // sent upon DeleteRow
				$widgetScope.tbl.on(ev, function(row){	// row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
		//-------------------------------------------------------
		// Cell events
		//-------------------------------------------------------
			case "cellEdited":
				$widgetScope.tbl.on(ev, function(cell)	{  // cell = cell component
					
					let row = cell.getRow();
					let col = cell.getColumn();
					let rowIdField = $widgetScope.rowIdField;
					let rowId = row.getIndex();
					let field = col.getField();
					let value = cell.getValue();
					
					if ($widgetScope.props.events.includes("cellEdited"))	// Event is registered in notifications
					{
						let eventMsg = new tbEventMsg(ev,$widgetScope.$socket.id);
						eventMsg.payload =   {
							[rowIdField]: rowId,
							field:    field,
							newValue: value,
							oldValue: cell.getOldValue()
						}
						$widgetScope.send(eventMsg);
					}
					// if not multi-user, send client sync notification
					if (!$widgetScope.props.multiUser)
					{
						let cellSyncMsg = new tbEventMsg(ev,$widgetScope.$socket.id);
						cellSyncMsg.tbCmd = 'tbCellEditSync';
						cellSyncMsg.payload = {
							[rowIdField]: rowId,
							field: field,
							value: value,
						}
						//piggyback the DS image on the event, to allow server node to update the datastore
						let dsImage = {
								timestamp: Date.now(),
								saveId: cellSyncMsg._msgid,
								exists: true,
								config: $widgetScope.tblConfig,
								data:   $widgetScope.tbl.getData(),
								styleMap: $widgetScope.tblStyleMap
							}
						cellSyncMsg.dsImage = dsImage;
						$widgetScope.tblHasDSImage = true;
						$widgetScope.sendClientCommand("tbCellEditSync",cellSyncMsg);	
					};
				});
				break;
			case "cellClick":
				$widgetScope.tbl.on(ev, function(e,cell){	// e = mouse event, cell = cell component
					let eventMsg = cellEventMsg(cell,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "cellTap":
				$widgetScope.tbl.on(ev, function(e,cell){	// e = mouse event, cell = cell component
					let eventMsg = cellEventMsg(cell,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "cellDblClick":
				$widgetScope.tbl.on(ev, function(e,cell){	// e = mouse event, cell = cell component
					let eventMsg = cellEventMsg(cell,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "cellDblTap":
				$widgetScope.tbl.on(ev, function(e,cell){	// e = mouse event, cell = cell component
					let eventMsg = cellEventMsg(cell,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "cellTapHold":
				$widgetScope.tbl.on(ev, function(e,cell){	// e = mouse event, cell = cell component
					let eventMsg = cellEventMsg(cell,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
/*
		//-------------------------------------------------------
		// Table events
		//-------------------------------------------------------
			case "tableDestroyed":  // Sent *after* table is destroyed
				$widgetScope.tbl.on(ev, function(){
					let eventMsg = new tbEventMsg(ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;

			case "dataFiltered":
				$widgetScope.tbl.on(ev, function(filters,rows){	// filters - array of filters currently applied, rows = array of row components which pass the filters
					let filteredData = new Array(rows.length)
					for (let i = 0 ; i < rows.length ; i++)
						filteredData[i] = rows[i].getData();

					let eventMsg = new tbEventMsg(ev,$widgetScope.$socket.id);
					eventMsg.payload = { filteredData: filteredData };
					$widgetScope.send(eventMsg);
				});
				break;
*/				
		//-------------------------------------------------------
			default:
				console.error("Event '"+ev+"' is not defined or unsupported");
				continue;
		}
		debugLog($widgetScope.id+": Set '"+ev+"' notifications");
	}
}
function rowEventMsg(row,ev,sockId)
{
	let evMsg = new tbEventMsg(ev,sockId);
	evMsg.payload = {
		rowIndex: row.getIndex(),
		rowData:  row.getData()
	}
	return	evMsg;
}
function cellEventMsg(cell,ev,sockId)
{
	let evMsg = new tbEventMsg(ev,sockId);
	evMsg.payload = {
		row:   cell.getRow().getIndex(),
		field: cell.getField(),
		value: cell.getValue(),
		type:  cell.getType()	// "cell" or "header"
	}
	return	evMsg;
}
function parseTblConfig(objStr)
{
	if (objStr.trim())
	{
		try  {
			let cfgObj = JSON.parse(objStr);

			// Check for rowId validity & duplicates
			if (cfgObj.hasOwnProperty("data") && Array.isArray(cfgObj.data))
			{
				let rowIdField = cfgObj.hasOwnProperty("index") ? cfgObj.index : "id";
				if (!checkRowIds(cfgObj.data,rowIdField))
				{
					console.error("Invalid or duplicate row Id's");
					return null;
				}
			}
			return cfgObj;
		}
		catch (err) {
			console.error("Invalid table configuration:",err);
			return null;
		}	
	}
	return {};
}
function loadThemeCSS(css,$widgetScope)
{
	// Load selected tabulator CSS file (currently global to the page)
	const tbThemeCSS = "omriTabulatorDynamicThemeCSS";
	const styleTags = document.getElementsByTagName("style");
	let exists = false;
	for (let i = 0; i < styleTags.length; i++)
		if (styleTags[i].id === tbThemeCSS)
		{
			exists = true;
			break;
		}
	if (!exists)
	{
		const el = document.createElement("style");
		el.type = "text/css";
		el.innerText = css; //"border:3px solid #add8e6;";
		el.id = tbThemeCSS;
		document.head.appendChild(el);
		console.log("Loaded CSS theme "+$widgetScope.props.themeFile);
	}
	else
		console.log("CSS theme already exists, ignoring");
}
// *********  Object Constructors  ****************************************************************
function tbStyleMap()
{
	this.tblStyles = null; // Table defaults
	this.hdrStyles = null; // Headers
	this.rows	   = []; // Array of row objects, each with row style + field-specific styles
}
function tbStyleMapRow(rowId)
{
	this.rowId	   = rowId;
	this.rowStyles = null;
	this.cells 	   = {};
}
function tbEventMsg(ev,sockId)
{
	this.topic = "tbNotification";
	this.event = ev;
	this.payload = {};
	this.NotificationId = createUniqueId();
	if (sockId)
		this._client = {socketId:sockId};
}
// *********  Utility functions  ****************************************************************
function checkRowIds(rows,idField)
{
	// Checks that the rows (to be added/updated in the table) have valid Ids, with no duplicates
	if (!Array.isArray(rows))
		return false;

	let idArr = [];
	for (let i = 0 ; i < rows.length ; i++)
	{
		if (rows[i][idField] === undefined || rows[i][idField] === null)
			return false;
		idArr.push(rows[i][idField]);
	}
	if ((new Set(idArr)).size !== rows.length)
		return false;
	return true;
}
function checkAddedRows(rows,$widgetScope)
{
	// Checks if added rows do not have the same Id as existing rows (to avoid duplicate Ids)
	if (!Array.isArray(rows))
		return false;

	let data = $widgetScope.tbl.getData();
	let rowIdField = $widgetScope.rowIdField;
	for (let i = 0 ; i < rows.length ; i++)
		if (data.findIndex((e)=> e[rowIdField] == rows[i][rowIdField]) >= 0)
			return false;
	return true;
}
function cloneObj(obj)
{
	// return structuredClone(obj);
	return JSON.parse(JSON.stringify(obj));
}
function createUniqueId()
{
	return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
							(+c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> +c / 4).toString(16));
}
function debugLog(t1,t2,t3,t4)
{
	if (window.tbPrintToLog)
		console.log("ui-tabulator:",t1, t2||"", t3||"", t4||"");
}
// *******************************************************************************************************************************
</script>
<style>
@import  "../../node_modules/tabulator-tables/dist/css/tabulator.min.css"
</style>

<style scoped>
/* CSS is auto scoped, but using named classes is still recommended */
.ui-tabulator-wrapper {
}
.ui-tabulator-class {
}
</style>
