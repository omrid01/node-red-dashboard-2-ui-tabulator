<template>
    <!-- Component must be wrapped in a block so props such as className and style can be passed in from parent    -->
    <div className="ui-tabulator-wrapper">
		<div ref="tabulatorDiv"></div>
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
// ******************************************************************************************************************************************
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
			tblDivId:		"",		// Optional, allow table instantiation on a specified Div, & access to the table from other template nodes, via Tabulator.findTable()
			rowIdField:		"id",	// The name of the field which holds the unique row Id (the default is 'id', but can be overriden)
			origTblConfig:	null,	// holds the original table configuration & data, as configured in the node (converted from JSON to an object). null=no tbl config in node
			currTblConfig:	null,	// Current (active) table configuration (excluding data). null = no table widget
			tblStyleMap:	null 	// The styles assigned to the table (via the tbSetStyle command)
		}
    },
// ******************************************************************************************************************************************
    mounted () {
		var $widgetScope = this; // Save the 'this' scope for socket listener, callbacks, external functions etc.
		
		window.tbPrintToLog = this.props.printToLog;
		debugLog(`***ui-tabulator node ${this.id} mounted on client ${this.$socket.id}, debug=${window.tbPrintToLog?"on":"off"}`);

		// parse the original table configuration & data (which were configured in the node)
		const cfgStr = this.props.initObj?.trim();
		if (cfgStr)
		{
			try  {
				this.origTblConfig = JSON.parse(cfgStr);
			}
			catch (err) {
				console.error(this.id+": Invalid table configuration:",err);
				this.origTblConfig = null;
			}	
		}
		
		// Load CSS theme
		if (this.props.themeCSS)
			loadThemeCSS(this.props.themeCSS,this);

		if (this.props.tblDivId);
		{
			this.tblDivId = this.props.tblDivId?.trim() || "";
//			this.$refs.tabulatorDiv.style.display = "none";  // hide the original DIV
		}

		// Set max table width (else will overflow with no horizontal scroller
		const maxWidth = this.props.maxWidth?.trim();
		if (maxWidth && !this.tblDivId)
			this.$refs.tabulatorDiv.style.width = maxWidth;

        // tell Node-RED that we're loading a new instance of this widget
        this.$socket.emit('widget-load', this.id)
		
		// ****************************************************************************************
		// listener for flow messages on input port
		// ****************************************************************************************
        this.$socket.on('msg-input:' + this.id, (msg) => {
			if (!msg || !acceptMsg(msg,$widgetScope))
				return;
			processMsg(msg,$widgetScope);
		});
		
		// ****************************************************************************************
		// Utility listener for custom server node notifications
		// ****************************************************************************************
		this.$socket.on('tbServerEvent:' + this.id, (msg) => {

			//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
			// Temp workaround - forcing client reload (due to NR framework bug)
			//-----------------------------------------------------------------
			if (msg.tbCmd === "tbReloadClient")
			{
				console.log($widgetScope.id+": Received reload request");

				// setTimeout(()=>location.reload(),5000);
				location.reload();
				return;
			}
			//^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

			if (!msg || !acceptMsg(msg,$widgetScope))
				return;
			processMsg(msg,$widgetScope);
		});
		
		// ***************************************************************************************************
		// msg listener for 'widget-load' event, sent from server when widget is loaded (with datastore image)
		// ***************************************************************************************************
		this.$socket.on('widget-load:' + this.id, (msg) => {
			initialTableLoad(msg,this)
        })
    },
// ******************************************************************************************************************************************
    unmounted () {
		destroyTable(this,null);

        /* Make sure, any events you subscribe to on SocketIO are unsubscribed to here */
        this.$socket?.off('widget-load:' + this.id)
        this.$socket?.off('msg-input:' + this.id)
		this.$socket?.off('tbServerEvent:' + this.id)
    },
// ******************************************************************************************************************************************
    methods: {
        //  widget-action just sends a msg to Node-RED, it does not store the msg state server-side
        //  alternatively, you can use widget-change, which will also store the msg in the Node's datastore
		
		send(msg) {
			// this.$socket.emit('widget-action', this.id, msg)
			
			// Instead of emitting to 'widget-action', we send the message as a custom event to the server, allowing the server to filter duplicate messages
			//(from concurrent clients, in shared mode)
			if (!msg.tbDoNotReply)
				this.$socket.emit('tbSendMessage'/*+this.id*/, this.id, msg)
        },
		sendClientCommand(cmd,msg) {
            msg.tbClientCmd = cmd;
            this.$socket.emit('tbClientCommands'/*+this.id*/, this.id, msg)
        },
		saveToDatastore(exists,config,data,styleMap,clientMsgId)	{
			let dsMsg = {};
            dsMsg.tbClientCmd = 'tbSaveToDatastore';
			dsMsg.clientMsgId = clientMsgId;
			dsMsg.payload = {
				timestamp: Date.now(),
				clientMsgId: clientMsgId,
				exists: exists,
				config: config,
				data:   data,
				styleMap: styleMap
			}
            this.$socket.emit('tbClientCommands'/*+this.id*/, this.id, dsMsg)
 		},
		clearDatastore(clientMsgId)
		{
			let dsMsg = {};
            dsMsg.tbClientCmd = 'tbClearDatastore';
			dsMsg.clientMsgId = clientMsgId;
            this.$socket.emit('tbClientCommands'/*+this.id*/, this.id, dsMsg)
		},
		showDatastore(sendMsg,clientMsgId)
		{
			let dsMsg = {};
            dsMsg.tbClientCmd = 'tbShowDatastore';
			dsMsg.clientMsgId = clientMsgId;
			dsMsg.sendMsg = sendMsg;
            this.$socket.emit('tbClientCommands'/*+this.id*/, this.id, dsMsg)
		}
	}
}
// ******************************************************************************************************************************************
// My functions
// ******************************************************************************************************************************************
// Determine if the client should accept the incoming message
function acceptMsg(msg,$widgetScope)
{
	 // Special utility msg for testing client/server connections. bypasses all scope constraints
	if (msg.tbCmd === "tbTestConnection")
		return true;

	let msgClientId = msg?._client?.socketId || "";  // get client Id

	// Check if msg includes an explicitly-specified client scope
	if (msg.hasOwnProperty("tbClientScope"))
	{
		switch (msg.tbClientScope)
		{
			case "tbAllClients":
				return true;
			case "tbSameClient":
				return (msgClientId && msgClientId === $widgetScope.$socket.id);
			case "tbNotSameClient":
				return (msgClientId !== $widgetScope.$socket.id);
			case "tbNone":
			default:
				return false;
		}
	}
	
	// Always accept msg if not from a specific client
	if (!msgClientId)
		return true;
		
	// When msg from specific client, accept per shared/multiUser mode
	if ($widgetScope.props.multiUser)  // in multi-user, accept only from own client
		return (msgClientId === $widgetScope.$socket.id);
	else
	{
		// in shared mode, accept data-changing messages even if originated by other clients
		const changeMsgs = [
			"tbCreateTable", "tbResetTable", "tbDestroyTable", "destroy",
			"tbSetStyle", "tbClearStyles",
			"addRow", "updateRow", "updateOrAddRow", "deleteRow",
			"addData", "setData", "replaceData", "updateData", "updateOrAddData", "clearData"
		];
		if (changeMsgs.includes(msg.tbCmd))
			return true;
		else
			return (msgClientId === $widgetScope.$socket.id);
	}
}
// ********************************************************************************************************************
function processMsg(msg,$widgetScope)
{
	delete msg.error;
	const cmd = msg.tbCmd;
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
			debugLog($widgetScope.id+": reloading table from node configuration");
			if (!$widgetScope.props.multiUser)  // Clear datastore
				$widgetScope.clearDatastore(msg._msgid);
			createTable($widgetScope.origTblConfig,$widgetScope,msg,null,false);
			return;
		case "tbCellEditSync":	// internal command notifying an in-cell edit in another client
			debugLog($widgetScope.id+": received cell edit sync");
			cellEditSync($widgetScope,msg);
			return; 

		// Utility/testing commands
		//-------------------------
		case "tbTestConnection":
			msg.payload = "Test Connection";
			msg.nodeId = $widgetScope.id;
			msg.clientSockId = $widgetScope.$socket.id;
			if (!msg.listener)
				msg.listener = 'tbClientCommands';
			switch (msg.listener)
			{
				//case 'widget-action':
				//	$widgetScope.$socket.emit('widget-action', $widgetScope.id, msg)
				//	break;
				case 'tbSendMessage':
					$widgetScope.$socket.emit('tbSendMessage'/*+$widgetScope.id*/, $widgetScope.id, msg)
					break;
				case 'tbClientCommands':
					msg.tbClientCmd = 'tbTestConnection';
					$widgetScope.$socket.emit('tbClientCommands'/*+$widgetScope.id*/, $widgetScope.id, msg)
			}
			console.log("Sent connection test ping to listener "+msg.listener);
			return; 
		case 'tbShowDatastore':
			$widgetScope.showDatastore((msg.sendMsg ? true : false),msg._msgid);
			return; 
/*
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
*/
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
			destroyTable($widgetScope,msg,true);
			return; 
		case "tbSetStyle":
			setStyle(msg.tbScope,msg.tbStyles,$widgetScope,msg);
			return; 
		case "tbClearStyles":
			debugLog($widgetScope.id+": clearing styles, reloading table with current config & data");
			let cfg = cloneObj($widgetScope.currTblConfig);
			cfg.data = $widgetScope.tbl.getData();
			createTable(cfg,$widgetScope,msg,null,true);
			return;
		case "tbSetGroupBy":
			setGroupBy($widgetScope,msg);
			return;
		//------------------------------------------------------------------
		// Managed Tabulator API calls
		//---------------------------------------------------------------------------------
		// Data-changing commands - called Async (response message is sent by the callback)
		//---------------------------------------------------------------------------------
		case "updateRow":
		case "updateOrAddRow":
			if ($widgetScope.props.validateRowIds && msg.tbArgs[1].hasOwnProperty($widgetScope.rowIdField))
			{
				const row = msg.tbArgs[1];
				if (!checkAddedDupRows([row],$widgetScope))
				{
					msg.error = "Duplicate row Id";
					$widgetScope.send(msg);
					return;
				}
			}
			tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);
			return;
		case "setData":
		case "replaceData":
		case "updateData":
		case "updateOrAddData":
			if ($widgetScope.props.validateRowIds && !checkInputRowIds(msg.tbArgs[0],$widgetScope.rowIdField))
			{
				msg.error = "Duplicate or invalid row Id's";
				$widgetScope.send(msg);
			}
			else
				tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);
			return;
		case "addData":
			if ($widgetScope.props.validateRowIds && (!checkInputRowIds(msg.tbArgs[0],$widgetScope.rowIdField) || !checkAddedDupRows(msg.tbArgs[0],$widgetScope)))
			{
				msg.error = "Duplicate or invalid row Id's";
				$widgetScope.send(msg);
			}
			else
				tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);
			return;
		case "addRow":
			if ($widgetScope.props.validateRowIds)
			{
				const row = msg.tbArgs[0];
				const idField = $widgetScope.rowIdField;
				if (!row || !row.hasOwnProperty(idField) || row[idField] == undefined || row[idField] == null)
				{
					msg.error = "Invalid or missing row Id";
					$widgetScope.send(msg);
					return;
				}
				if (!checkAddedDupRows([row],$widgetScope))
				{
					msg.error = "Duplicate row Id";
					$widgetScope.send(msg);
					return;
				}
			}
			tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);
			return;
		case "deleteRow":
			tabulatorAsyncAPI(cmd,msg.tbArgs,msg,$widgetScope);
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
			tabulatorSyncAPI(cmd,msg.tbArgs,msg,$widgetScope,function(rowComponent,msg){  // applies parser func on returned row component
				if (rowComponent)
					msg.payload = rowComponent.getData();
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
			tabulatorFreehandAPI(cmd,msg.tbArgs,msg,$widgetScope);
			return;
	}
}
// ********************************************************************************************************************
function updateAndRespond(msg,$widgetScope)
{
	//---------------------------------------------------------------------------------------------------------
	// Generic post-command handler, which:
	//   - for 'change' commands (in shared mode), updates the table's style map (if needed), and the datastore
	//   - sends a response command
	//---------------------------------------------------------------------------------------------------------
	if (!$widgetScope.props.multiUser)
	{
		// Update style map, in case rows have been added or deleted
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
						const tblRows = tbl.getRows();
						map.rows = map.rows.filter((row) => {		// keep only row-style objects of rows which exists in the new data
							let index = tblRows.findIndex((rowComp) => rowComp.getCell(rowIdField).getValue() == row.rowId);  // not ===
							//console.log("row",row.rowId,found ? " found" : " not found");
							return index >= 0 ? true : false;
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
		updateDatastore($widgetScope,msg);
	}
	$widgetScope.send(msg);
}
// ********************************************************************************************************************
function createTable(initObj,$widgetScope,msg,styleMap,saveToDS)
{
	//-----------------------------------------------------------------------------------------------------------------
	// Called from:
	// 1. Initial load - no msg/response, no DS update. if from DS, can include styles
	// 2. tbCreateTable command - msg/response, no styles, update DS
	// 3. tbResetTable command - msg/response, no styles, no update DS (DS is cleared before)
	// 4. tbClearStyles command - msg/response, no styles, update DS
	//-----------------------------------------------------------------------------------------------------------------

	// if coming from a 'tbCreateTable', validate the input and return if invalid
	if (msg?.tbCmd === "tbCreateTable")
	{
		if (!initObj)
		{
			msg.error = "Invalid table configuration";
			$widgetScope.send(msg);
			return;
		}
		// Check row Id validity & no dups
		if ($widgetScope.props.validateRowIds && initObj.hasOwnProperty("data"))
		{
			const idField = initObj.hasOwnProperty("index") ? initObj.index : "id";
			if (!checkInputRowIds(initObj.data,idField))
			{
				msg.error = "Invalid or duplicate row Id's"; 
				$widgetScope.send(msg);
				return;
			}
		}
	}
		
	if (!initObj)	// no initialization object --> destroy current table (if exists), return without creating a new table
	{
		destroyTable($widgetScope,msg,saveToDS);  // destroy current table (if exists)
		if (msg)
		{
			msg.payload = "Table not created";
			$widgetScope.send(msg);
		}
		return;
	}

	destroyTable($widgetScope,null,false);  // destroy current table (if exists)
	// pass a cloned configuration object (rather than an object reference), to protect the original object (from modification inside Tabulator)
	const clonedInitObj = cloneObj(initObj);

	// Create a new table
	try  
	{
		// create the table
		if (!$widgetScope.tblDivId)
			$widgetScope.tbl = new Tabulator($widgetScope.$refs.tabulatorDiv, clonedInitObj);
		else
			$widgetScope.tbl = new Tabulator("#"+$widgetScope.tblDivId, clonedInitObj);
		
			// console.log("Table created");
			// $widgetScope.send({payload:"Table created"});
		
		// Table creation is asynchronous. The setup resumes after the table finished initializing, in the below "TableBuilt" callback
		//-----------------------------------------------------------------------------------------------------------------------
		$widgetScope.tbl.on("tableBuilt", function()    {
			$widgetScope.tblReady = true;

			$widgetScope.currTblConfig = cloneObj(initObj);
			delete $widgetScope.currTblConfig.data;

			if (styleMap)
			{
				$widgetScope.tblStyleMap = cloneObj(styleMap);
				applyFromStyleMap(styleMap,$widgetScope.tbl)
			}
			else
				//$widgetScope.tblStyleMap = new tbStyleMap();
				$widgetScope.tblStyleMap = null;
			
			if (initObj.hasOwnProperty("index"))	// overriding the default 'id' field as the row identifier
				$widgetScope.rowIdField = initObj.index;

			// Set notifications for the selected events 
			setEventNotifications($widgetScope);

			if ($widgetScope.props.events.includes("tableBuilt"))	// if this is explicitely specified in the notification list, send the notification from here
			{
				let eventMsg = new tbEventMsg("tableBuilt",$widgetScope.$socket.id);
				eventMsg.payload = "Table built and ready";
				$widgetScope.send(eventMsg);
			}

			if (!$widgetScope.props.multiUser && saveToDS)
			{
				const data = initObj.data || [];
				$widgetScope.saveToDatastore(true,$widgetScope.currTblConfig,data,styleMap,msg?._msgid || "");
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
		$widgetScope.currTblConfig = null;
		$widgetScope.tblStyleMap = null;

		if (!$widgetScope.props.multiUser && saveToDS)
			$widgetScope.saveToDatastore(false,null,null,null,msg?._msgid || "");
		if (msg)
		{
			msg.payload = "Table creation failed";
			msg.error = err.message;
			$widgetScope.send(msg);
		}
	}	
}
// ********************************************************************************************************************
function initialTableLoad(dsImage,$widgetScope)
{
	const dsDummyImage = "dummyDSImage";	// workaround: server does not send this event if no data in datastore, so we force dummy data

	if ($widgetScope.props.multiUser || !dsImage || dsImage === "dummyDSImage")
	{
		if ($widgetScope.origTblConfig)
			console.log($widgetScope.id+": Creating table from node configuration");
		else
			console.log($widgetScope.id+": No table configuration");

		createTable($widgetScope.origTblConfig,$widgetScope,null,null,false);
		return;
	}
	
	// shared mode with image in datastore
	if (!dsImage.exists)  // stored image = 'no table' (not to confuse with 'no stored image')
	{
		console.log($widgetScope.id+": table configuration in datastore is null");
		createTable(null,$widgetScope,null,null,false);
		return;
	}
	
	// image has table definition
	console.log($widgetScope.id+": Creating table from datastore image");
	let initObj;
	if (dsImage.config)  // Stored image includes table configuration
		initObj = dsImage.config;
	else
	{
		initObj = cloneObj($widgetScope.origTblConfig);
		delete initObj.data;
	}
	if (dsImage.data)
		initObj.data = dsImage.data;

	// create the table
	createTable(initObj,$widgetScope,null,dsImage.styleMap,false);
}
// ********************************************************************************************************************
function destroyTable($widgetScope,msg,saveToDS)
{
	//-----------------------------------------------------------------------------------------------------------------
	// Called from:
	// 1. tbDestroyTable command - msg/response, update DS
	// 2. from within createTable - 
	//    - msg/response as in caller
	//    - if table config OK, no DS update (DS is updated by the created table)
	//    - if no table config, updates DS per caller argument ( to "no table")
	// 3. unmounted() - no msg/response, no DS update
	//-----------------------------------------------------------------------------------------------------------------

	if ($widgetScope.tbl)
	{
		$widgetScope.tbl.clearData();
		$widgetScope.tbl.destroy();
		console.log($widgetScope.id+": Table destroyed");
	}
	$widgetScope.tbl = null;
	$widgetScope.tblReady = false;
	$widgetScope.currTblConfig = null;
	$widgetScope.tblStyleMap = null;

	if (!$widgetScope.props.multiUser && saveToDS)
		$widgetScope.saveToDatastore(false,null,null,null,msg?._msgid || "");

	if (msg)
		$widgetScope.send(msg);
}
// ********************************************************************************************************************
function updateDatastore($widgetScope,msg)
{
	if (!$widgetScope.currTblConfig)
	{
		$widgetScope.saveToDatastore(false,null,null,null,msg?._msgid);
		return;
	}

	$widgetScope.saveToDatastore(true,$widgetScope.currTblConfig,$widgetScope.tbl.getData(),$widgetScope.tblStyleMap,msg?._msgid);
}
// ********************************************************************************************************************
function setStyle(scope,styles,$widgetScope,msg)
{
/*  Logic:
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
		updateDatastore($widgetScope,msg);
	}
	$widgetScope.send(msg);
}
// ********************************************************************************************************************
function applyStyles(element,styles)
{
	// example: cellObj.getElement().style.backgroundColor = "cyan";
	for (const prop in styles)
	{
		if (element.style.hasOwnProperty(prop))
			element.style[prop] = styles[prop];
	}		
}
// ********************************************************************************************************************
function updateStyleMap($widgetScope,rowId,field,styles)
{
/*  Logic:
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
// ********************************************************************************************************************
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
// ********************************************************************************************************************
function setGroupBy($widgetScope,msg)
{
	if (!msg.tbFields || msg.tbFields == "" || msg.tbFields == [])
		$widgetScope.tbl.setGroupBy(false); // clear grouping
	else
	{
		let fields = Array.isArray(msg.tbFields) ? msg.tbFields : [msg.tbFields];
		$widgetScope.tbl.setGroupBy(fields);

		/*
		groupHeader:function(value, count, data, group){
			//value - the value all members of this group share
			//count - the number of rows in this group
			//data - an array of all the row data objects in this group
			//group - the group component for the group
		*/
		if (msg.tbGroupHeader) 
		{
			try {
				if (fields.length === 1)
					$widgetScope.tbl.setGroupHeader(function(value, count, data, group) {
							let hdr = msg.tbGroupHeader;
							hdr = hdr.replaceAll('$field',fields[0]);
							hdr = hdr.replaceAll('$value',value);
							hdr = hdr.replaceAll('$count',count);
							// Set field counter in case of multiple grouping fields
							return hdr;
						});
				else
				{
					let funcArr = [];
					for (let i = 0 ; i < fields.length ; i++)
					{
						let func = function(value, count, data, group) {
							let hdr = msg.tbGroupHeader;
							hdr = hdr.replaceAll('$field',fields[i]);
							hdr = hdr.replaceAll('$value',value);
							hdr = hdr.replaceAll('$count',count);
							return hdr;
						};
						funcArr.push(func);
					}
					$widgetScope.tbl.setGroupHeader(funcArr);
				}
			}
			catch (err)	{
				msg.error = "GroupBy error: "+err;
			}
		}
	}
	$widgetScope.send(msg);
}
// ********************************************************************************************************************
function cellEditSync($widgetScope,msg)
{
	debugLog("processing sync message on cell-edit in another client");
		
	let data = {};
	let idField = $widgetScope.rowIdField;
	data[idField] = msg.payload[idField];
	data[msg.payload.field] = msg.payload.value;
	try  {
		$widgetScope.tbl.updateData([data]);
	}
	catch (err)  {
		console.error($widgetScope.id+": Cell-edit sync failed:",err.message);
	}
	// Not sending a response msg to the flow, since this is an internal sync message
}
// ********************************************************************************************************************
// Tabulator API calls (Async, Sync, Auto)
// ********************************************************************************************************************
function tabulatorAsyncAPI(cmd,cmdArgs,msg,$widgetScope)
{
	debugLog("Calling '"+cmd+"', API mode=Async");
	let args = cmdArgs ? cloneObj(cmdArgs) : [];	// for some reason, sometimes it doesn't work with the original args object

	$widgetScope.tbl[cmd](...args)
		.then(function(xxx){
			updateAndRespond(msg,$widgetScope);
		})
		.catch(function(err){
			msg.error = err;
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
// ********************************************************************************************************************
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
		//-------------------------------------------------------
		// Table events
		//-------------------------------------------------------
			case "tableBuilt":	// Listener is set automatically during createTable(). If also explicitly set in the events list, it will also issue a notification from there
				break;
			case "tableDestroyed":  // Sent *after* table is destroyed
				$widgetScope.tbl.on(ev, function(){
					let eventMsg = new tbEventMsg(ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "dataChanged":
				$widgetScope.tbl.on(ev, function(data){
					let eventMsg = new tbEventMsg(ev,$widgetScope.$socket.id);
					evMsg.payload = data;
					$widgetScope.send(eventMsg);
				});
				break;
/*
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
		// Row events
		//-------------------------------------------------------
			case "rowClick":
			case "rowDblClick":
			case "rowTap":
			case "rowDblTap":
			case "rowTapHold":
				$widgetScope.tbl.on(ev, function(evObj,row){	// row = row component
					let eventMsg = rowEventMsg(row,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
			case "rowAdded":  	// sent upon addRow, updateOrAddRow, addData or updateOrAddData
			case "rowUpdated":	// sent only upon programmatic data update (updateRow, updateOrAddRow, updateData or updateOrAddData), not in-cell edits
			case "rowDeleted": // sent upon DeleteRow
			case "rowSelected": // sent upon manual or programmatic row selection
			case "rowDeselected": // sent upon manual or programmatic row deselection
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

					let eventMsg = new tbEventMsg(ev,$widgetScope.$socket.id);
					
					let row = cell.getRow();
					let col = cell.getColumn();
					let rowIdField = $widgetScope.rowIdField;
					let rowId = row.getIndex();
					let field = col.getField();
					let value = cell.getValue();
					
					if ($widgetScope.props.events.includes("cellEdited"))	// Event is registered in notifications
					{
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
						eventMsg.tbCmd = 'tbCellEditSync';
						eventMsg.payload = {
							[rowIdField]: rowId,
							field: field,
							value: value,
						}
						//piggyback the DS image on the event, to allow server node to update the datastore
						eventMsg.dsImage = {
							timestamp: Date.now(),
							clientMsgId: eventMsg.notificationId,
							exists: true,
							config: $widgetScope.currTblConfig,
							data:   $widgetScope.tbl.getData(),
							styleMap: $widgetScope.tblStyleMap
						}
						$widgetScope.sendClientCommand("tbCellEditSync",eventMsg);	
					};
				});
				break;
			case "cellClick":
			case "cellTap":
			case "cellDblClick":
			case "cellDblTap":
			case "cellTapHold":
				$widgetScope.tbl.on(ev, function(e,cell){	// e = mouse event, cell = cell component
					let eventMsg = cellEventMsg(cell,ev,$widgetScope.$socket.id);
					$widgetScope.send(eventMsg);
				});
				break;
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
// ********************************************************************************************************************
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
	this.notificationId = createUniqueId();
	if (sockId)
		this._client = {socketId:sockId};
}
// *********  Utility functions  ****************************************************************
function checkInputRowIds(rows,idField)
{
	// Checks that the rows (to be added/updated in the table) have valid Ids, with no duplicates
	if (!Array.isArray(rows))
		return false;

    for (let i = 0 ; i < rows.length ; i++)
	{
		if (rows[i][idField] == undefined || rows[i][idField] == null)
			return false;

        for (let j = i+1 ; j < rows.length; j++)
            if (rows[i][idField] === rows[j][idField])
                return false;
	}
    return true;
/*
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
*/
}
function checkAddedDupRows(rows,$widgetScope)
{
	// Checks if added rows do not have the same Id as existing rows (to avoid duplicate Ids)
    const tblRows = $widgetScope.tbl.getRows();
	const idField = $widgetScope.rowIdField;

	for (let i = 0 ; i < rows.length ; i++)
	{
		if (tblRows.findIndex((rowComp)=> rowComp.getCell(idField).getValue() == rows[i][idField]) >= 0)
			return false;
	}
	return true;
/*	
    rowComps.forEach(function(rowComp) {
        let rowId = compRow.getCell($widgetScope.rowIdField).getValue());

		if (data.findIndex((e)=> e[rowIdField] == rows[i][rowIdField]) >= 0)
			return false;
		
	});

	let data = $widgetScope.tbl.getData();
	for (let i = 0 ; i < rows.length ; i++)
		if (data.findIndex((e)=> e[rowIdField] == rows[i][rowIdField]) >= 0)
			return false;
	return true;
*/
}
function cloneObj(obj)
{
// 		return structuredClone(obj);
//		clone = loadsh.cloneDeep(obj);
//		clone = JSON.parse(JSON.stringify(obj));
//		clone = RED.util.cloneMessage(obj);
/*
function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (obj instanceof Date) {
        return new Date(obj);
    }
    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }
    if (obj instanceof Function) {
        return obj.bind({});
    }
    const clonedObj = {};
    for (let key in obj) {
        if (obj.hasOwnProperty(key)) {
            clonedObj[key] = deepClone(obj[key]);
        }
    }
    return clonedObj;
}*/
	let clone = null;
	try  {
		clone = structuredClone(obj);
		return clone;
	}
	catch (err)	{
		try	{
			clone = JSON.parse(JSON.stringify(obj));
			return clone;
		}
		catch (err)	{
			console.error("Object cloning failed:",err);
		}
	}
	return null;
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
