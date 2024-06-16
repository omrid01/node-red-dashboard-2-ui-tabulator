module.exports = function (RED) {
	const fs = require('fs');

    function UITabulatorNode (config) {
        RED.nodes.createNode(this, config)

        const node = this;
		console.info("ui-tabulator: creating ui-tabulator server node "+node.id);

		// Set debug log policy
		let e = process.env.TBDEBUG;
		var printToLog  = (e && e.toLowerCase() === 'true') ? true : false;
		config.printToLog = printToLog;

		// Saving last msg id's to allow filtering duplicate messages (from concurrent open clients)
		node.lastMsgId = "";
		node.lastNotificationId = "";
		node.lastSaveId = "";
		node.lastClientMsgId = "";

        // which group are we rendering this widget
        const group = RED.nodes.getNode(config.group)
        const base = group.getBase()

        // server-side event handlers
        const evts = {
            onAction: true,
            onInput: function (msg, send, done) {  // the *input* message coming into the server node input port
				
                // forward it as-is to any connected nodes in Node-RED
                if (config.passthru)
					send(msg);
            },

            onSocket: {
				// Function arguments: conn = socketId, id = node.id
				//-------------------------------------------------------------------------------------------------
				//['widget-action']: function  (conn, id, msg) {
				//	console.log("'widget action' msg:",msg)
                //},

				//-------------------------------------------------------------------------------------------------
				// Generic message sender. filters duplicate messages (from multiple open clients, in shared mode)
                ['tbSendMessage'+node.id]: function (conn, id, msg) {

					// Connection Test
					if (msg.tbCmd === "tbTestConnection")
					{
						console.log("ui-tabulator connection test: ping from node="+msg.serverNodeId+", client="+msg.clientId+", on listener "+msg.listener);
						node.send(msg);
						return;
					}
						
					// Table notifications
					if (msg.topic === "tbNotification")
					{
						if (config.multiUser || msg.NotificationId !== node.lastNotificationId)
						{
							node.lastNotificationId = msg.NotificationId;
							node.send(msg);
						}
						return;
					}

					// Table reponse messages
					if (config.multiUser || msg._msgid !== node.lastMsgId)
					{
						node.lastMsgId = msg._msgid;
						node.send(msg);
					}
                },

				//-------------------------------------------------------------------------------------------------
				// Internal commands from the client
                ['tbClientCommands'+node.id]: function (conn, id, msg) {
					switch (msg.tbClientCmd)
					{
						// Notification from a table (when in shared mode) about an in-cell user edit.
						// Since this is a user-originated change (on a single client), it needs to be distributed to all other clients
						//---------------------------------------------------------------------
						case 'tbCellEditSync':
							debugLog("Received cell edited sync notification");
							// Update datastore
							base.stores.data.save(base, node, msg.dsImage);
							delete msg.dsImage;
							msg.tbClientScope = "tbNotOriginator";	// update only the other clients
							// update other nodes
							node.emit('input', msg);	// node is sending to itself, forcing replication to all clients
							break;

						// Datastore commands
						//---------------------------------------------------------------------
						case 'tbSaveToDatastore':
							if (msg.saveId !== node.lastSaveId)
							{
								node.lastSaveId = msg.saveId;
								let dsImage = msg.payload;
								//	debugLog(`Saving table for node.id ${node.id}, saveId ${dsImage.saveId}, exists:${dsImage.exists}, config:${dsImage.config}, data:${dsImage.data?dsImage.data.length+' rows': null}`);
								base.stores.data.save(base, node, dsImage);
							}
							break;
						case 'tbShowDatastore':		// for testing
							if (msg.clientMsgId !== node.lastClientMsgId)
							{
								node.lastClientMsgId = msg.clientMsgId;
								let data = base.stores.data.get(id) || "<null>";
								console.log("Datastore image for node "+node.id+":",data);
								if (msg.sendMsg)
									node.send({payload:data});
							}
							break;
						case 'tbClearDatastore':
							if (msg.clientMsgId !== node.lastClientMsgId)
							{
								node.lastClientMsgId = msg.clientMsgId;
								if (msg.setDummy)
								{
									base.stores.data.save(base, node, dsDummyImage);
									debugLog("Set dummy to datastore: node.id="+node.id);
								}
								else
								{
									base.stores.data.clear(id);
									debugLog("Datastore cleared: node.id="+node.id);
								}
							}
							break;
						// Test client/server-node connectivity
						//---------------------------------------------------------------------
						case 'tbTestConnection':
							console.log("ui-tabulator connection test: ping from node="+msg.serverNodeId+", client="+msg.clientId+", on listener "+msg.listener);
							node.send(msg);
							break;
					}
				}
            }
        }

		// Set a "dummy" object in the data store to ensure 'widget-load' notification
		const dsDummyImage = "dummyDSImage";
		let dsImage = base.stores.data.get(node.id);
		debugLog(node.id+": current datastore image=",dsImage ||'<none>');
		if (!dsImage)
			base.stores.data.save(base, node, dsDummyImage);

       // inform the dashboard UI that we are adding this node
        if (group) {
            group.register(node, config, evts)
        } else {
            node.error('No group configured')
        }

		// read theme CSS file, if configured
		config.themeCSS = "";
		let themeFile = config.themeFile.trim();
		if (themeFile)
		{
			const urlPrefix = "@URL:";
			const cssPrefix = "@CSS:"
			if (themeFile.match(new RegExp('^@URL:','i')) !== null)  // URL
			{
				const fileURL = themeFile.slice(urlPrefix.length);
				debugLog("Fetching file from URL",fileURL);
				let fetchOK = false;
				fetch(fileURL)
					.then((response) => {
						if (response.ok)
							fetchOK = true;
						return response.text()
					})
					.then(text => {
						if (fetchOK)
						{
							config.themeCSS = text;
							console.log("ui-tabulator: CSS file fetched successfully, length=",data.length);
						}
						else
							console.error("Error fetching CSS file:",text);
					})
					.catch(err => {
						console.error('Error fetching CSS file:', err);
					});
			}
			else	// File
			{
				try	{
					if (themeFile.match(new RegExp('^@CSS:','i')) !== null)  // take CSS file from Tabulator dist
					{
						// __dirname = location of this (executing) file , in this case = C:\Node-red\Dsh2\node-red-ui-tabulator\nodes
						// Tabulator CSS files are in C:/Node-red/Dsh2/node-red-ui-tabulator/node_modules/tabulator-tables/dist/css/
						// For example: tabulator_midnight.min.css, tabulator_modern.min.css etc.
						
						// check in internal directory
						let cssDir =  __dirname + "/../node_modules/tabulator-tables/dist/css/";
						if (fs.existsSync(cssDir))
						{
							debugLog("Found local CSS directory "+cssDir);
							themeFile = cssDir + themeFile.slice(cssPrefix.length);
						}
						else
						{
							// check in Node-red packages
							cssDir =  __dirname + "/../../../tabulator-tables/dist/css/";
							if (fs.existsSync(cssDir))
							{
								debugLog("Found CSS directory in Node-red");
								themeFile = cssDir + themeFile.slice(cssPrefix.length);
							}
							else
								console.error("Cannot find CSS directory");
						}
					}
					// else use file name as-is

					debugLog("Reading CSS file", themeFile);
					let data = fs.readFileSync(themeFile,"utf8");
					config.themeCSS = data;
					console.log("ui-tabulator: CSS file read successfully, length=",data.length);
				}
				catch (err)	{
					console.error("Cannot read CSS file: ",err);
				}
			}
		}

		// Temp workaround - forcing browser 'reload' command to all clients due to NR socket bug
		setTimeout(()=>{
			debugLog("Sending reload command to clients");
			node.emit('input', {tbCmd:"tbReloadClient"})
		}, 2000);
		
		function debugLog(t1,t2,t3,t4)
		{
			if (printToLog)
				console.log("ui-tabulator:",t1, t2||"", t3||"", t4||"");
		}
}
    RED.nodes.registerType('ui-tabulator', UITabulatorNode)
}
